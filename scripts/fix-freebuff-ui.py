"""Fix garbled/pixelated rendering in freebuff-web-ui chat.

Fixes:
1. Google Fonts FOIT -- non-blocking font loading
2. Split ANSI escape codes -- buffer raw, strip on render
3. Full buffer re-render -- rAF debounce
"""
import os

UI_DIR = r'C:\Users\Admin\Projects\freebuff-web-ui\public'

# -- 1. Fix index.html: non-blocking font loading --
index_path = os.path.join(UI_DIR, 'index.html')

with open(index_path, 'r', encoding='utf-8') as f:
    html = f.read()

old_font_link = """    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />"""

new_font_link = """    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
      rel="stylesheet"
      media="print" onload="this.media='all'"
    />
    <noscript><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" /></noscript>"""

html = html.replace(old_font_link, new_font_link)

with open(index_path, 'w', encoding='utf-8') as f:
    f.write(html)

print('[OK] index.html -- non-blocking font loading added')

# -- 2. Rewrite app.js --
app_path = os.path.join(UI_DIR, 'app.js')

new_app_js = r"""/* Freebuff Web UI -- v2 (fixed: ANSI split, rAF debounce, no FOIT) */

var $ = function(id) { return document.getElementById(id); };

var statusEl = $('status');
var cwdEl = $('cwd');
var messagesEl = $('messages');
var promptEl = $('prompt');
var sendBtn = $('send');
var attachBtn = $('attach-btn');
var fileInput = $('file-input');
var imagePreviewsEl = $('image-previews');
var agentStatusEl = $('agent-status');

var socket = null;
var pendingImages = [];
var isProcessing = false;
/** Raw terminal data accumulated (not yet stripped of ANSI) */
var rawTerminalBuf = '';

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = 'pill ' + (kind || 'connecting');
}

function setAgentStatus(text, active) {
  agentStatusEl.textContent = text;
  agentStatusEl.classList.toggle('active', !!active);
}

function buildWsUrl() {
  return (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/terminal';
}

/**
 * Strip all ANSI/VT escape sequences from text.
 * Works on full accumulated buffer so split sequences are handled correctly.
 */
function stripAnsi(s) {
  if (!s) return '';
  // OSC (Operating System Command): ESC ] ... (BEL | ST)
  s = s.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
  // DCS / SOS / PM / APC: ESC (P|X|^|_) ... ST
  s = s.replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '');
  // CSI sequences: ESC [ <params> <intermediate> <final>
  s = s.replace(/\x1b\[[0-9;:?]*[ -/]*[@-~]/g, '');
  // Remaining ESC sequences (two-byte)
  s = s.replace(/\x1b[ -/][@-~]/g, '');
  // Lone ESC characters
  s = s.replace(/\x1b/g, '');
  // Carriage returns
  s = s.replace(/\r/g, '');
  // Non-printable control chars (except newline/tab)
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  return s;
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMarkdown(text) {
  if (!text) return '';
  var parts = text.split(/```/);
  var out = '';
  for (var i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      var html = escapeHtml(parts[i])
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br/>');
      out += html;
    } else {
      var lines = parts[i].split('\n');
      var lang = lines[0] && !lines[0].includes(' ') ? escapeHtml(lines[0]) : '';
      var code = (lang ? lines.slice(1) : lines).join('\n').trim();
      out += '<pre' + (lang ? ' class="lang-' + lang + '"' : '') + '><code>' + escapeHtml(code) + '</code></pre>';
    }
  }
  return out;
}

function addMessage(role, text, opts) {
  opts = opts || {};
  var welcome = messagesEl.querySelector('.welcome');
  if (welcome) welcome.remove();
  var row = document.createElement('article');
  row.className = 'msg msg-' + role;
  var avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? 'You' : 'FB';
  var body = document.createElement('div');
  body.className = 'msg-content';
  if (opts.images && opts.images.length) {
    var grid = document.createElement('div');
    grid.className = 'msg-images';
    for (var j = 0; j < opts.images.length; j++) {
      var wrap = document.createElement('div');
      wrap.className = 'msg-image-wrap';
      var el = document.createElement('img');
      el.src = opts.images[j].dataUrl;
      el.alt = 'Screenshot';
      wrap.appendChild(el);
      grid.appendChild(wrap);
    }
    body.appendChild(grid);
  }
  if (role === 'assistant') {
    var inner = document.createElement('div');
    inner.className = 'msg-text prose';
    inner.innerHTML = renderMarkdown(text || '');
    body.appendChild(inner);
  } else if (text) {
    var p = document.createElement('p');
    p.textContent = text;
    body.appendChild(p);
  }
  row.appendChild(avatar);
  row.appendChild(body);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return row;
}

function showWelcome() {
  if (messagesEl.children.length) return;
  var card = document.createElement('div');
  card.className = 'welcome';
  card.innerHTML = '<h2>What should we work on?</h2>' +
    '<p>Ask Freebuff to read files, fix bugs, run commands, or debug issues.</p>' +
    '<div class="welcome-chips">' +
    '<button type="button" class="chip" data-prompt="Read AGENTS.md and summarize repo rules">Repo rules</button>' +
    '<button type="button" class="chip" data-prompt="Run npm run typecheck and fix errors">Typecheck</button>' +
    '<button type="button" class="chip" data-prompt="Show git log --oneline -10">Recent commits</button></div>';
  messagesEl.appendChild(card);
  card.querySelectorAll('[data-prompt]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      promptEl.value = btn.getAttribute('data-prompt') || '';
      promptEl.focus();
    });
  });
}

var responseRow = null;
var responseBodyEl = null;

function startResponseStream() {
  responseRow = addMessage('assistant', '...');
  responseBodyEl = responseRow.querySelector('.msg-text.prose');
}

/**
 * Render the full stripped terminal buffer into the response bubble.
 * Called via requestAnimationFrame to coalesce multiple chunks.
 */
function flushRender() {
  if (!responseBodyEl || !responseRow) return;
  var stripped = stripAnsi(rawTerminalBuf).trim();
  responseBodyEl.innerHTML = renderMarkdown(stripped || '');
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function finalizeResponse() {
  if (responseBodyEl) {
    flushRender();
  }
  responseRow = null;
  responseBodyEl = null;
  rawTerminalBuf = '';
  isProcessing = false;
  setAgentStatus('Ready', false);
}

var rafPending = false;

function scheduleFlush() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(function() {
    rafPending = false;
    flushRender();
  });
}

function addImage(file) {
  if (!file.type.startsWith('image/')) { alert('Only image files are supported.'); return; }
  if (file.size > 10 * 1024 * 1024) { alert('Image too large. Max 10MB.'); return; }
  var reader = new FileReader();
  reader.onload = function() {
    pendingImages.push({ dataUrl: reader.result, description: null });
    renderImagePreviews();
  };
  reader.readAsDataURL(file);
}

function removeImage(index) {
  pendingImages.splice(index, 1);
  renderImagePreviews();
}

function renderImagePreviews() {
  if (pendingImages.length === 0) {
    imagePreviewsEl.classList.add('hidden');
    imagePreviewsEl.innerHTML = '';
    return;
  }
  imagePreviewsEl.classList.remove('hidden');
  imagePreviewsEl.innerHTML = '';
  pendingImages.forEach(function(img, i) {
    var wrap = document.createElement('div');
    wrap.className = 'img-preview';
    var el = document.createElement('img');
    el.src = img.dataUrl;
    el.alt = 'Screenshot ' + (i + 1);
    var remove = document.createElement('button');
    remove.className = 'img-remove';
    remove.textContent = 'x';
    remove.addEventListener('click', function() { removeImage(i); });
    wrap.appendChild(el);
    wrap.appendChild(remove);
    imagePreviewsEl.appendChild(wrap);
  });
}

async function describePendingImages() {
  var toDescribe = pendingImages.filter(function(img) { return !img.description; });
  if (toDescribe.length === 0) return;
  var loadingEl = document.createElement('div');
  loadingEl.className = 'msg msg-system';
  loadingEl.innerHTML = '<div class="msg-content">Analyzing screenshot...</div>';
  messagesEl.appendChild(loadingEl);
  for (var k = 0; k < toDescribe.length; k++) {
    try {
      var resp = await fetch('/api/describe-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: toDescribe[k].dataUrl }),
      });
      var data = await resp.json();
      toDescribe[k].description = data.description || '[Screenshot]';
    } catch (e) {
      toDescribe[k].description = '[Screenshot]';
    }
  }
  loadingEl.remove();
}

async function sendPrompt() {
  var text = promptEl.value.trim();
  var hasImages = pendingImages.length > 0;
  if (!text && !hasImages) return;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    addMessage('system', 'Not connected. Waiting for reconnection...');
    return;
  }
  if (isProcessing) return;
  isProcessing = true;
  promptEl.value = '';
  if (hasImages) {
    await describePendingImages();
  }
  var finalPrompt = text;
  if (hasImages) {
    var descriptions = pendingImages.map(function(img, i) {
      return '[Screenshot ' + (i + 1) + ': ' + img.description + ']';
    }).join('\n');
    finalPrompt = text ? text + '\n\n' + descriptions : 'Analyze this screenshot:\n\n' + descriptions;
  }
  addMessage('user', text || '(screenshot analysis)', { images: hasImages ? pendingImages : undefined });
  pendingImages = [];
  renderImagePreviews();
  setAgentStatus('Working...', true);
  rawTerminalBuf = '';
  startResponseStream();
  socket.send(JSON.stringify({ type: 'input', data: finalPrompt + '\r' }));
}

function connect() {
  if (socket) { socket.close(); socket = null; }
  messagesEl.innerHTML = '';
  responseRow = null;
  responseBodyEl = null;
  rawTerminalBuf = '';
  rafPending = false;
  isProcessing = false;
  pendingImages = [];
  renderImagePreviews();
  showWelcome();
  setStatus('Connecting...', 'connecting');
  setAgentStatus('Connecting...', true);
  socket = new WebSocket(buildWsUrl());
  socket.addEventListener('open', function() {
    setStatus('Connected', 'ok');
    setAgentStatus('Ready', false);
    promptEl.focus();
  });
  socket.addEventListener('message', function(event) {
    var msg;
    try { msg = JSON.parse(event.data); } catch (e) { return; }
    if (msg.type === 'output') {
      // Accumulate raw data -- strip on render to handle split ANSI sequences
      rawTerminalBuf += msg.data;
      scheduleFlush();
      return;
    }
    if (msg.type === 'ready') {
      if (msg.cwd) cwdEl.textContent = msg.cwd;
      setAgentStatus('Ready', false);
      addMessage('system', 'Connected to Freebuff. Working directory: ' + (msg.cwd || 'unknown'));
      return;
    }
    if (msg.type === 'exit') {
      setStatus('Disconnected', 'err');
      setAgentStatus('Offline', false);
      finalizeResponse();
      addMessage('system', msg.message || 'Session ended. Reconnecting...');
      setTimeout(connect, 3000);
    }
  });
  socket.addEventListener('close', function() {
    if (!isProcessing) {
      setStatus('Disconnected', 'err');
      setAgentStatus('Offline', false);
    }
  });
  socket.addEventListener('error', function() {
    setStatus('Error', 'err');
  });
}

sendBtn.addEventListener('click', sendPrompt);
promptEl.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPrompt(); }
});
attachBtn.addEventListener('click', function() { fileInput.click(); });
fileInput.addEventListener('change', function() {
  var files = Array.from(fileInput.files || []);
  files.forEach(addImage);
  fileInput.value = '';
});
window.addEventListener('paste', function(e) {
  var items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (var i = 0; i < items.length; i++) {
    if (items[i].type.startsWith('image/')) {
      e.preventDefault();
      var file = items[i].getAsFile();
      if (file) addImage(file);
      break;
    }
  }
});
document.querySelectorAll('[data-prompt]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    promptEl.value = btn.getAttribute('data-prompt') || '';
    promptEl.focus();
  });
});
promptEl.addEventListener('input', function() {
  promptEl.style.height = 'auto';
  promptEl.style.height = Math.min(promptEl.scrollHeight, 160) + 'px';
});
fetch('/api/info').then(function(r) { return r.json(); }).then(function(info) {
  if (info.cwd) cwdEl.textContent = info.cwd;
}).catch(function() {});
connect();
"""

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(new_app_js)

print('[OK] app.js -- raw buffer + rAF debounce + comprehensive ANSI stripping')
print()
print('Summary of fixes:')
print('  1. index.html: Google Fonts loads with media="print" -> non-blocking (no FOIT)')
print('  2. app.js: Raw terminal data accumulated, ANSI stripped on flush, not per-chunk')
print('  3. app.js: requestAnimationFrame debounce prevents DOM thrashing per-chunk')
print('  4. app.js: Comprehensive ANSI stripping (OSC, DCS, CSI, all edge cases)')

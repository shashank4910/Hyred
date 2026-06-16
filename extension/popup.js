// Popup UI for JobRadar Autofill
// Storage keys (kept in chrome.storage.local):
//   jr_url:    base URL of the JobRadar deployment, e.g. https://...
//   jr_token:  long-lived JWT issued by /api/extension/auth

const $ = (sel) => document.querySelector(sel);
const VERSION = chrome.runtime.getManifest().version;
$('#ver').textContent = VERSION;

async function getStored() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['jr_url', 'jr_token'], (v) => resolve(v || {}));
  });
}
async function setStored(o) {
  return new Promise((resolve) => chrome.storage.local.set(o, resolve));
}
async function clearStored() {
  return new Promise((resolve) =>
    chrome.storage.local.remove(['jr_url', 'jr_token'], resolve),
  );
}

function host(u) {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

function showConnectIntro() {
  $('#connected').classList.add('hidden');
  $('#setup').classList.add('hidden');
  $('#connect-intro').classList.remove('hidden');
  $('#connect-status').textContent = '';
  $('#error').textContent = '';
}
function showSetup() {
  $('#connected').classList.add('hidden');
  $('#connect-intro').classList.add('hidden');
  $('#setup').classList.remove('hidden');
  $('#error').textContent = '';
}
let lastProfile = null;

function showTab(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('hidden', p.id !== `panel-${name}`);
  });
}

function renderProfileCopy(profile) {
  const el = $('#profile-copy');
  if (!el) return;
  const p = profile ?? {};
  const rows = [
    ['Full name', p.full_name],
    ['Email', p.email],
    ['Phone', p.phone],
    ['City', p.location?.city],
    ['State', p.location?.region],
    ['Country', p.location?.country],
    ['ZIP', p.zip_code],
    ['LinkedIn', p.links?.linkedin],
    ['GitHub', p.links?.github],
    ['Portfolio', p.links?.portfolio],
    ['Current title', p.current_title],
    ['Years experience', p.years_experience],
    ['Notice period', p.notice_period],
    ['Expected CTC', p.expected_ctc],
    ['Work auth country', p.work_auth_country],
  ].filter(([, v]) => v != null && String(v).trim() !== '');

  el.innerHTML =
    rows
      .map(
        ([label, val]) => `
      <div class="copy-row">
        <span class="copy-label">${escape(label)}</span>
        <span class="copy-val">${escape(String(val))}</span>
        <button type="button" class="btn-copy" data-copy="${escape(String(val))}">Copy</button>
      </div>`,
      )
      .join('') ||
    '<p class="muted">Complete Application Profile in Hyred Settings.</p>';

  el.querySelectorAll('.btn-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy || '');
        btn.textContent = 'Copied';
        setTimeout(() => {
          btn.textContent = 'Copy';
        }, 1200);
      } catch {
        /* ignore */
      }
    });
  });
}

function renderMatchCard(match) {
  const card = $('#match-card');
  if (!card) return;
  if (!match?.job) {
    card.classList.add('hidden');
    card.innerHTML = '';
    return;
  }
  card.classList.remove('hidden');
  card.innerHTML = `
    <div class="match-title">${escape(match.job.title)}</div>
    <div class="match-sub">${escape(match.job.company || '')} · score ${match.score ?? '—'}</div>
  `;
}

function renderInsights(match) {
  const el = $('#insights-body');
  if (!el) return;
  if (!match?.job) {
    el.innerHTML =
      '<p class="muted">No Hyred match for this page. Import the job in Hyred first for keyword insights.</p>';
    return;
  }
  const matched = (match.matched_skills || []).slice(0, 12);
  const missing = (match.missing_skills || []).slice(0, 12);
  el.innerHTML = `
    <div class="insight-block">
      <div class="insight-head">${escape(match.job.title)} @ ${escape(match.job.company || '')}</div>
      <div class="insight-score">Match score: <strong>${match.score ?? '—'}</strong></div>
    </div>
    ${
      matched.length
        ? `<div class="insight-block"><div class="section-label">Matched skills</div><div class="chips">${matched.map((s) => `<span class="chip ok">${escape(s)}</span>`).join('')}</div></div>`
        : ''
    }
    ${
      missing.length
        ? `<div class="insight-block"><div class="section-label">Missing keywords (add to resume)</div><div class="chips">${missing.map((s) => `<span class="chip warn">${escape(s)}</span>`).join('')}</div></div>`
        : '<p class="muted">No missing-skill gaps recorded for this match.</p>'
    }
    <p class="muted" style="margin-top:8px">Like Simplify Copilot — tailor your resume for missing keywords in Hyred.</p>
  `;
}

async function loadTabContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:/i.test(tab.url)) {
    renderMatchCard(null);
    renderInsights(null);
    return;
  }
  const res = await sendBg('matchByUrl', { url: tab.url });
  const match = res.ok ? res.match : null;
  renderMatchCard(match);
  renderInsights(match);
}

function showConnected(url, profile) {
  $('#connect-intro').classList.add('hidden');
  $('#setup').classList.add('hidden');
  $('#connected').classList.remove('hidden');
  $('#connected-host').textContent = host(url);
  lastProfile = profile ?? null;
  const p = profile ?? {};
  $('#profile-summary').innerHTML = [
    p.full_name && `<div class="row-kv"><span class="label">Name</span>${escape(p.full_name)}</div>`,
    p.email && `<div class="row-kv"><span class="label">Email</span>${escape(p.email)}</div>`,
    p.phone && `<div class="row-kv"><span class="label">Phone</span>${escape(p.phone)}</div>`,
    p.location?.full && `<div class="row-kv"><span class="label">Location</span>${escape(p.location.full)}</div>`,
  ]
    .filter(Boolean)
    .join('') || '<span class="label">Complete Application Profile in Hyred Settings.</span>';
  renderProfileCopy(profile);
  loadTabContext();
}

function canonicalHyredUrl(url) {
  let u = String(url || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    if (parsed.hostname === 'hyred.in' || parsed.hostname === 'www.hyred.in') {
      return 'https://www.hyred.in';
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return u;
  }
}

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Refresh connected state via background (avoids popup CORS edge cases).
async function refreshConnected() {
  const { jr_url, jr_token } = await getStored();
  if (!jr_url || !jr_token) {
    showConnectIntro();
    return;
  }

  const verify = await sendBg('ping');
  if (!verify.connected) {
    await clearStored();
    await tryAutoConnect();
    return;
  }

  const prof = await sendBg('profile');
  if (prof.ok) {
    showConnected(jr_url, prof.profile);
  } else {
    showConnected(jr_url, null);
  }
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  return { ok: res.ok, status: res.status, data };
}

// Send a message to the background service worker and await a response.
// Always reads chrome.runtime.lastError (otherwise Chrome logs an "Unchecked
// runtime.lastError: Could not establish connection" warning) and retries once
// when the MV3 worker was briefly asleep / the channel closed mid-flight.
const sendBg = (type, payload, _retried) =>
  new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    try {
      chrome.runtime.sendMessage({ type, payload }, (res) => {
        const err = chrome.runtime.lastError;
        if (err) {
          const transient =
            /Receiving end does not exist|message channel closed|message port closed/i.test(
              err.message || '',
            );
          if (transient && !_retried) {
            setTimeout(() => done(sendBg(type, payload, true)), 150);
            return;
          }
          done({ ok: false, error: err.message || 'no response' });
          return;
        }
        done(res ?? { ok: false, error: 'no response' });
      });
    } catch (e) {
      done({ ok: false, error: String(e?.message ?? e) });
    }
  });

// Try to auto-connect via background.js strategies:
//   1. Stored token → verify
//   2. getCookieToken (tab localStorage → fallback to cookies → exchange)
// If all fail, show the "Connect to Hyred" intro page.
async function tryAutoConnect() {
  const { jr_url, jr_token } = await getStored();

  // Strategy 1: stored token → show connected optimistically (instant), then
  // verify in the background. Only revert if verification actually fails.
  if (jr_url && jr_token) {
    showConnected(jr_url, lastProfile);
    const verify = await sendBg('ping');
    if (verify.connected) {
      const prof = await sendBg('profile');
      showConnected(jr_url, prof.ok ? prof.profile : null);
      return;
    }
    await clearStored();
  }

  // Strategy 2: try reading session from open tab or cookies
  const bg = await sendBg('getCookieToken');
  if (bg.ok && bg.data?.token) {
    const { jr_url } = await getStored();
    showConnected(jr_url || 'https://www.hyred.in', bg.data.profile || null);
    return;
  }

  // All auto-connect strategies failed — show the connect-intro page
  showConnectIntro();
}

// Initiate the auth tab flow: opens hyred.in/auth/extension in a new tab,
// background.js will inject a script to read the JWT from localStorage.
// We poll every 2s for the stored token.
async function initiateConnect() {
  const statusEl = $('#connect-status');
  const btn = $('#btn-connect-extension');
  btn.disabled = true;
  btn.textContent = 'Connecting…';
  statusEl.textContent = 'Opening Hyred — sign in if prompted…';

  const bg = await sendBg('connectExtension');

  btn.disabled = false;
  btn.textContent = 'Connect to Hyred';

  if (bg.ok && bg.data?.token) {
    statusEl.textContent = '';
    await refreshConnected();
    return;
  }

  // Token may have been saved even if the message response was lost (popup closed).
  const { jr_token } = await getStored();
  if (jr_token) {
    statusEl.textContent = '';
    await refreshConnected();
    return;
  }

  statusEl.textContent =
    bg.error === 'auth timeout or no token found'
      ? 'Not connected. Log into Hyred in the tab that opened, then try again.'
      : bg.error || 'Connection failed. Try again or use app password.';
}

// -------------------------------------------------------------------
// Event wiring
// -------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', tryAutoConnect);

// If the background saves a token while the popup is still open (e.g. the auth
// tab finished after the user reopened the popup), reflect it live.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.jr_token && changes.jr_token.newValue) {
    refreshConnected();
  }
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => showTab(tab.dataset.tab));
});

// Primary connect button
$('#btn-connect-extension').addEventListener('click', initiateConnect);

// Show APP_PASSWORD setup form
$('#btn-show-setup').addEventListener('click', showSetup);

// Back button from setup to connect-intro
$('#btn-back-connect').addEventListener('click', showConnectIntro);

// Setup form (APP_PASSWORD)
$('#setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#error').textContent = '';
  const btn = $('#btn-connect');
  btn.disabled = true;
  btn.textContent = 'Connecting…';
  let url = canonicalHyredUrl($('#url').value);
  const password = $('#password').value;

  try {
    const auth = await fetchJson(`${url}/api/extension/auth`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!auth.ok || !auth.data.token) {
      throw new Error(auth.data.error || `Auth failed (${auth.status})`);
    }
    await setStored({ jr_url: url, jr_token: auth.data.token });
    await refreshConnected();
  } catch (err) {
    $('#error').textContent = err.message || 'Connection failed';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Connect';
  }
});

$('#btn-recheck').addEventListener('click', refreshConnected);

$('#btn-disconnect').addEventListener('click', async () => {
  await clearStored();
  showConnectIntro();
});

// Manual-trigger button: works on any URL even if the FAB didn't auto-mount.
$('#btn-autofill-tab').addEventListener('click', async () => {
  const errEl = $('#autofill-error');
  errEl.textContent = '';
  const btn = $('#btn-autofill-tab');
  btn.disabled = true;
  btn.textContent = 'Filling…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) {
      throw new Error('Open a job application page (https) first.');
    }
    // Make sure the engine + content script are injected (no-op if already
    // loaded). autofill-engine.js MUST load first — content.js depends on it.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['autofill-engine.js', 'content.js'],
      });
    } catch (e) {
      throw new Error(
        `Cannot run on this page: ${e?.message ?? 'restricted URL'}`,
      );
    }
    const options = {
      resume: $('#opt-resume')?.checked !== false,
      coverLetter: $('#opt-cover')?.checked !== false,
      commonFields: $('#opt-common')?.checked !== false,
      aiQuestions: $('#opt-ai')?.checked !== false,
    };
    chrome.tabs.sendMessage(
      tab.id,
      { type: 'TRIGGER_AUTOFILL', payload: { options } },
      () => {
      const err = chrome.runtime.lastError;
      if (err) {
        errEl.textContent = err.message;
      } else {
        window.close();
      }
    });
  } catch (e) {
    errEl.textContent = e.message ?? 'Failed';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Autofill this page';
  }
});

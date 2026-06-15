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

function showSetup() {
  $('#connected').classList.add('hidden');
  $('#setup').classList.remove('hidden');
}
function showConnected(url, profile) {
  $('#setup').classList.add('hidden');
  $('#connected').classList.remove('hidden');
  $('#connected-host').textContent = host(url);
  const p = profile ?? {};
  $('#profile-summary').innerHTML = [
    p.full_name && `<div class="row-kv"><span class="label">Name</span>${escape(p.full_name)}</div>`,
    p.email && `<div class="row-kv"><span class="label">Email</span>${escape(p.email)}</div>`,
    p.phone && `<div class="row-kv"><span class="label">Phone</span>${escape(p.phone)}</div>`,
    p.location?.full && `<div class="row-kv"><span class="label">Location</span>${escape(p.location.full)}</div>`,
  ]
    .filter(Boolean)
    .join('') || '<span class="label">No profile data found.</span>';
}

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Refresh connected state: re-fetch profile and show connected UI.
// Used by: recheck button, and after successful setup form submission.
async function refreshConnected() {
  const { jr_url, jr_token } = await getStored();
  if (!jr_url || !jr_token) {
    showSetup();
    return;
  }
  const prof = await fetchJson(`${jr_url}/api/extension/profile`, {
    headers: { authorization: `Bearer ${jr_token}` },
  });
  if (prof.ok) {
    showConnected(jr_url, prof.data.profile);
  } else {
    // Token expired — try auto-connect or show setup
    await clearStored();
    await tryAutoConnect();
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
const sendBg = (type, payload) =>
  new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, payload }, (res) =>
        resolve(res ?? { ok: false, error: 'no response' }),
      );
    } catch (e) {
      resolve({ ok: false, error: String(e?.message ?? e) });
    }
  });

// Try to auto-connect via Supabase session cookie (primary auth for multi-user).
// The call goes through the background service worker to avoid CORS issues.
// Falls back to APP_PASSWORD setup if the user isn't logged into hyred.in.
async function tryAutoConnect() {
  const { jr_url, jr_token } = await getStored();

  // If we already have a stored token, verify it first
  if (jr_url && jr_token) {
    const verify = await fetchJson(`${jr_url}/api/extension/verify`, {
      headers: { authorization: `Bearer ${jr_token}` },
    });
    if (verify.ok) {
      const prof = await fetchJson(`${jr_url}/api/extension/profile`, {
        headers: { authorization: `Bearer ${jr_token}` },
      });
      showConnected(jr_url, prof.ok ? prof.data.profile : null);
      return;
    }
    // Token expired — try session refresh below
    await clearStored();
  }

  // Try to auto-connect by reading the Supabase session cookie directly
  // via chrome.cookies API (the ONLY reliable way for extensions to access
  // cross-origin cookies). The background.js handler reads the cookie,
  // extracts the access_token, exchanges it for an extension JWT, and
  // stores the result — all in one call.
  const bg = await sendBg('getCookieToken');
  if (bg.ok && bg.data?.token) {
    // Token was already saved by background.js; just show connected
    const { jr_url } = await getStored();
    showConnected(jr_url || 'https://hyred.in', bg.data.profile || null);
    return;
  }

  // No session found — show the old setup form (APP_PASSWORD fallback)
  showSetup();
}

document.addEventListener('DOMContentLoaded', tryAutoConnect);

$('#setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#error').textContent = '';
  const btn = $('#btn-connect');
  btn.disabled = true;
  btn.textContent = 'Connecting…';
  let url = $('#url').value.trim().replace(/\/+$/, '');
  const password = $('#password').value;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

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
  showSetup();
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
    // Make sure the content script is injected (no-op if already loaded).
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
    } catch (e) {
      throw new Error(
        `Cannot run on this page: ${e?.message ?? 'restricted URL'}`,
      );
    }
    chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_AUTOFILL' }, () => {
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

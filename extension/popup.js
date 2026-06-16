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
function showConnected(url, profile) {
  $('#connect-intro').classList.add('hidden');
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

// Try to auto-connect via background.js strategies:
//   1. Stored token → verify
//   2. getCookieToken (tab localStorage → fallback to cookies → exchange)
// If all fail, show the "Connect to Hyred" intro page.
async function tryAutoConnect() {
  const { jr_url, jr_token } = await getStored();

  // Strategy 1: stored token → verify via background
  if (jr_url && jr_token) {
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
    showConnected(jr_url || 'https://hyred.in', bg.data.profile || null);
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

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

async function refreshConnected() {
  const { jr_url, jr_token } = await getStored();
  if (!jr_url || !jr_token) {
    showSetup();
    return;
  }
  // Verify token + load profile in one go.
  const verify = await fetchJson(`${jr_url}/api/extension/verify`, {
    headers: { authorization: `Bearer ${jr_token}` },
  });
  if (!verify.ok) {
    await clearStored();
    showSetup();
    $('#error').textContent = 'Session expired — please reconnect.';
    return;
  }
  const prof = await fetchJson(`${jr_url}/api/extension/profile`, {
    headers: { authorization: `Bearer ${jr_token}` },
  });
  showConnected(jr_url, prof.ok ? prof.data.profile : null);
}

document.addEventListener('DOMContentLoaded', refreshConnected);

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

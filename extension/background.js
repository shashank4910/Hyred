// JobRadar Autofill — background service worker (Manifest V3)
//
// The service worker is the single network-call hub. Content scripts
// post messages here to keep CORS and auth concerns out of the page world.

async function getCreds() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['jr_url', 'jr_token'], (v) => resolve(v || {}));
  });
}

async function api(path, init = {}) {
  const { jr_url, jr_token } = await getCreds();
  if (!jr_url || !jr_token) {
    return { ok: false, status: 0, error: 'not_connected' };
  }
  let res;
  try {
    res = await fetch(`${jr_url}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${jr_token}`,
        ...(init.headers || {}),
      },
    });
  } catch (e) {
    return { ok: false, status: 0, error: String(e?.message ?? e) };
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  return { ok: res.ok, status: res.status, data };
}

const DEFAULT_URL = 'https://hyred.in';

// Read the Supabase auth token from hyred.in cookies via chrome.cookies API.
// Extensions with the "cookies" permission CAN read HttpOnly cookies for their
// host_permissions domains. This is the ONLY reliable way for an extension to
// access cross-origin session cookies (cookies are SameSite=Lax and can't be
// sent via fetch with credentials).
async function getCookieToken() {
  try {
    // Find all cookies for hyred.in that look like Supabase auth cookies.
    // Supabase stores the session as: sb-{project-ref}-auth-token
    const cookies = await chrome.cookies.getAll({ domain: 'hyred.in' });
    const authCookie = cookies.find(c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'));
    if (!authCookie?.value) return null;

    // The cookie value is a base64-encoded JSON array:
    // ["access_token", "refresh_token", "user", ...]
    // or may be URL-encoded. Try parsing it.
    let raw = authCookie.value;
    // URL-decode if needed
    if (raw.includes('%')) raw = decodeURIComponent(raw);
    const parsed = JSON.parse(raw);
    const accessToken = Array.isArray(parsed) ? parsed[0] : null;
    return accessToken || null;
  } catch (e) {
    console.warn('[Hyred] getCookieToken failed:', e);
    return null;
  }
}

// Exchange a Supabase access_token for an extension JWT.
// This is more reliable than the session endpoint because we pass the auth
// token directly (not via cookies) — no CORS, no cookie restrictions.
async function exchangeToken(accessToken) {
  try {
    const res = await fetch(`${DEFAULT_URL}/api/extension/exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.token) return null;
    return data;
  } catch (e) {
    console.warn('[Hyred] exchangeToken failed:', e);
    return null;
  }
}

const handlers = {
  async ping() {
    const { jr_url, jr_token } = await getCreds();
    if (!jr_url || !jr_token) return { connected: false };
    const r = await api('/api/extension/verify');
    return { connected: !!r.ok, url: jr_url };
  },

  // Try to auto-connect by reading the Supabase session cookie directly
  // via chrome.cookies API, then exchanging it for an extension JWT.
  async getCookieToken() {
    const accessToken = await getCookieToken();
    if (!accessToken) return { ok: false, error: 'no cookie found' };
    const result = await exchangeToken(accessToken);
    if (!result) return { ok: false, error: 'exchange failed' };
    // Save to storage so subsequent calls use the stored token
    await new Promise((resolve) =>
      chrome.storage.local.set({ jr_url: DEFAULT_URL, jr_token: result.token }, resolve),
    );
    return { ok: true, data: { token: result.token, profile: result.profile } };
  },

  async profile() {
    const r = await api('/api/extension/profile');
    if (!r.ok) return { ok: false, error: r.data?.error ?? `HTTP ${r.status}` };
    return { ok: true, profile: r.data.profile };
  },

  async matchByUrl({ url }) {
    const r = await api(
      `/api/extension/match-by-url?url=${encodeURIComponent(url)}`,
    );
    if (!r.ok) return { ok: false, error: r.data?.error ?? `HTTP ${r.status}` };
    return { ok: true, match: r.data.match };
  },

  async answerQuestion({ question, match_id, page_text, max_words }) {
    const r = await api('/api/extension/answer', {
      method: 'POST',
      body: JSON.stringify({ question, match_id, page_text, max_words }),
    });
    if (!r.ok) return { ok: false, error: r.data?.error ?? `HTTP ${r.status}` };
    return { ok: true, answer: r.data.answer };
  },

  async markApplied({ match_id }) {
    const r = await api('/api/extension/apply', {
      method: 'POST',
      body: JSON.stringify({ match_id }),
    });
    return { ok: !!r.ok, error: r.ok ? undefined : r.data?.error };
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const fn = handlers[msg?.type];
  if (!fn) {
    sendResponse({ ok: false, error: `unknown message ${msg?.type}` });
    return false;
  }
  Promise.resolve(fn(msg.payload || {}))
    .then((res) => sendResponse(res))
    .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
  return true; // keep the channel open for the async response
});

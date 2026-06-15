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

// Try to auto-connect via Supabase session cookie.
// This is an internal handler (not triggered by content script) called from
// the popup. The background service worker has no CORS restrictions, so we
// can use `credentials: 'include'` safely here.
async function callSession(url) {
  const baseUrl = url || DEFAULT_URL;
  try {
    const res = await fetch(`${baseUrl}/api/extension/session`, {
      credentials: 'include',
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

const handlers = {
  async ping() {
    const { jr_url, jr_token } = await getCreds();
    if (!jr_url || !jr_token) return { connected: false };
    const r = await api('/api/extension/verify');
    return { connected: !!r.ok, url: jr_url };
  },

  async session({ url }) {
    return callSession(url);
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

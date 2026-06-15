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

// Try to extract the Supabase access_token from localStorage by injecting a
// script into a hyred.in tab with MAIN world access.
// The content script runs in an ISOLATED world and can't read the page's
// localStorage directly. But we can use chrome.scripting.executeScript with
// world: 'MAIN' to execute code in the page's own context.
// This requires a hyred.in tab to be open in the browser.
async function extractTokenFromTab() {
  try {
    // Find any open hyred.in tab
    const tabs = await chrome.tabs.query({ url: ['*://hyred.in/*', '*://*.hyred.in/*'] });
    if (!tabs.length) {
      console.warn('[Hyred] No hyred.in tab found');
      return null;
    }
    const tab = tabs[0];
    // Execute a script in the MAIN world (page's own JS context) to read
    // the Supabase auth token from localStorage.
    // Supabase stores the session under key: sb-{project-ref}-auth-token
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => {
        try {
          const key = Object.keys(localStorage).find(
            k => k.startsWith('sb-') && k.endsWith('-auth-token'),
          );
          if (!key) return null;
          const data = JSON.parse(localStorage[key]);
          return data?.access_token || null;
        } catch {
          return null;
        }
      },
    });
    return results?.[0]?.result || null;
  } catch (e) {
    console.warn('[Hyred] extractTokenFromTab failed:', e);
    return null;
  }
}

// Exchange a Supabase access_token for an extension JWT.
// The access_token is passed directly in the request body (no cookies needed).
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

  // Auto-connect by reading the Supabase access_token from the page's
  // localStorage (via MAIN-world script injection into an open hyred.in tab).
  // Then exchange it for an extension JWT.
  async getCookieToken() {
    const accessToken = await extractTokenFromTab();
    if (!accessToken) return { ok: false, error: 'no token found in hyred.in tab' };
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

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

// Decode URL-safe base64 (base64url) to a UTF-8 string. Returns null on failure.
// @supabase/ssr encodes session cookies as "base64-<base64url>".
function base64UrlDecodeToString(b64url) {
  try {
    let s = String(b64url).replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4;
    if (pad) s += '='.repeat(4 - pad);
    const bin = atob(s);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return null;
  }
}

// Try to extract the Supabase access_token from localStorage by injecting a
// script into a hyred.in tab with MAIN world access.
// The content script runs in an ISOLATED world and can't read the page's
// localStorage directly. But we can use chrome.scripting.executeScript with
// world: 'MAIN' to execute code in the page's own context.
// This requires a hyred.in tab to be open in the browser.
async function extractTokenFromTab() {
  try {
    // Find any open hyred.in tab
    const tabs = await chrome.tabs.query({
      url: ['*://hyred.in/*', '*://*.hyred.in/*', '*://www.hyred.in/*'],
    });
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
          // Try to get Supabase session from localStorage
          const stored = localStorage.getItem('sb-*-auth-token');
          if (stored) {
            const session = JSON.parse(decodeURIComponent(stored));
            return session?.access_token || null;
          }
          // Fallback to old method
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

// Fallback: extract the access_token from Supabase session cookies directly
// via chrome.cookies API. This does NOT require an open hyred.in tab — it
// reads the cookie that @supabase/ssr stores on the hyred.in domain.
// Cookie name format: sb-{project-ref}-auth-token
// Value: JSON-encoded session object (URL-encoded).
async function extractTokenFromCookies() {
  try {
    const allCookies = [
      ...(await chrome.cookies.getAll({ domain: 'hyred.in' })),
      ...(await chrome.cookies.getAll({ domain: '.hyred.in' })),
      ...(await chrome.cookies.getAll({ domain: 'www.hyred.in' })),
    ];
    if (!allCookies.length) {
      console.warn('[Hyred] No cookies found for hyred.in');
      return null;
    }

    // Supabase (@supabase/ssr) auth cookie: sb-{ref}-auth-token, optionally
    // chunked as sb-{ref}-auth-token.0, .1, ... when the session is large.
    const authCookies = allCookies.filter(
      (c) => c.name.startsWith('sb-') && c.name.includes('auth-token'),
    );
    if (!authCookies.length) {
      console.warn('[Hyred] No Supabase auth cookie found');
      return null;
    }

    // Reassemble: prefer the un-suffixed base cookie; otherwise concat chunks
    // (.0, .1, ...) in numeric order.
    let raw = '';
    const base = authCookies.find((c) => /-auth-token$/.test(c.name));
    if (base && base.value) {
      raw = base.value;
    } else {
      const chunks = authCookies
        .filter((c) => /-auth-token\.\d+$/.test(c.name))
        .sort((a, b) => {
          const ai = parseInt(a.name.split('.').pop(), 10);
          const bi = parseInt(b.name.split('.').pop(), 10);
          return ai - bi;
        })
        .map((c) => c.value);
      raw = chunks.join('');
    }

    if (!raw) {
      console.warn('[Hyred] Supabase auth cookie has no value');
      return null;
    }

    // Value may be URL-encoded, and newer @supabase/ssr prefixes with "base64-"
    // using URL-safe base64 (chars - and _), which plain atob() can't decode.
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      /* not url-encoded */
    }

    if (decoded.startsWith('base64-')) {
      decoded = base64UrlDecodeToString(decoded.slice('base64-'.length));
      if (decoded === null) {
        console.warn('[Hyred] base64url cookie decode failed');
        return null;
      }
    }

    let session;
    try {
      session = JSON.parse(decoded);
    } catch {
      try {
        session = JSON.parse(raw);
      } catch {
        console.warn('[Hyred] Could not parse auth cookie value');
        return null;
      }
    }

    const accessToken =
      session?.access_token ||
      (Array.isArray(session) ? session[0]?.access_token : null);

    if (!accessToken) {
      console.warn('[Hyred] No access_token in session cookie');
      return null;
    }

    return accessToken;
  } catch (e) {
    console.warn('[Hyred] extractTokenFromCookies failed:', e);
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

// Read Supabase session from cookies → exchange for an extension JWT → save.
// Standalone (not a handler method) so it can be reused without `this`.
async function connectViaCookies() {
  let accessToken = await extractTokenFromTab();
  if (!accessToken) accessToken = await extractTokenFromCookies();
  if (!accessToken) return { ok: false, error: 'no auth session found' };

  const result = await exchangeToken(accessToken);
  if (!result) return { ok: false, error: 'exchange failed' };

  await new Promise((resolve) =>
    chrome.storage.local.set(
      { jr_url: DEFAULT_URL, jr_token: result.token },
      resolve,
    ),
  );
  return { ok: true, data: { token: result.token, profile: result.profile } };
}

// Verify a token via the server (background fetch bypasses CORS).
async function verifyToken(token, base) {
  try {
    const res = await fetch(`${base}/api/extension/verify`, {
      headers: { authorization: `Bearer ${token}` },
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: String(e?.message ?? e) };
  }
}

const handlers = {
  // Handshake entry point — called by the hyred.in content script (connect.js)
  // with a freshly-signed extension JWT it picked up from the web app. We
  // verify before saving so a stale/invalid token never overwrites a good one.
  async storeToken({ token } = {}) {
    if (!token) return { ok: false, error: 'no token' };
    const base = DEFAULT_URL; // canonical; verify works regardless of www
    const v = await verifyToken(token, base);
    if (!v.ok) {
      console.warn('[Hyred] storeToken: token failed verify', v.status, v.error || '');
      return { ok: false, status: v.status, error: 'token failed verification' };
    }
    await new Promise((resolve) =>
      chrome.storage.local.set({ jr_url: base, jr_token: token }, resolve),
    );
    console.log('[Hyred] storeToken: saved verified token from handshake');
    return { ok: true };
  },

  async ping() {
    const { jr_url, jr_token } = await getCreds();
    console.log('[JobRadar BG] ping — jr_url:', jr_url, 'jr_token:', jr_token ? jr_token.slice(0, 30) + '...' : 'MISSING');
    if (!jr_url || !jr_token) return { connected: false, reason: 'no credentials in storage' };
    const r = await api('/api/extension/verify');
    console.log('[JobRadar BG] verify result:', JSON.stringify(r));
    return { connected: !!r.ok, url: jr_url, verifyStatus: r.status, verifyError: r.data?.error };
  },

  // Auto-connect by reading the Supabase access_token.
  // Strategy (tried in order):
  //   1. Inject MAIN-world script into an open hyred.in tab to read localStorage
  //   2. Read the Supabase session cookie directly via chrome.cookies API
  // Then exchange the access_token for an extension JWT.
  async getCookieToken() {
    return connectViaCookies();
  },

  // Primary connect flow — runs entirely in the background (survives the popup
  // closing). Strategy:
  //   1. Best-effort silent cookie exchange (works if already logged in AND the
  //      cookie format parses — kept as a fast path, never blocks the flow).
  //   2. Open the /auth/extension tab. The hyred.in content-script handshake
  //      (connect.js + connect-main.js) picks up the freshly-signed token the
  //      page emits and calls storeToken here. We just poll storage for it.
  async connectExtension() {
    // 1. Fast path: silent cookie exchange.
    const direct = await connectViaCookies();
    if (direct.ok) {
      console.log('[Hyred] connectExtension: connected via cookies');
      return direct;
    }

    // 2. Open the auth tab — the handshake does the rest.
    const authUrl = `${DEFAULT_URL}/auth/extension`;
    let tab;
    try {
      tab = await chrome.tabs.create({ url: authUrl, active: true });
    } catch (e) {
      return { ok: false, error: `could not open auth tab: ${e?.message ?? e}` };
    }

    // 3. Poll chrome.storage for the token the handshake saves.
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1000));
      const { jr_token } = await getCreds();
      if (jr_token) {
        try {
          await chrome.tabs.remove(tab.id);
        } catch {
          /* tab may already be closed */
        }
        console.log('[Hyred] connectExtension: token saved via handshake');
        return { ok: true, data: { token: jr_token } };
      }
    }

    console.warn('[Hyred] connectExtension: handshake timeout');
    return {
      ok: false,
      error: 'auth timeout — sign in on the Hyred tab, then click Connect again',
    };
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

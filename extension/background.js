// JobRadar Autofill — background service worker (Manifest V3)
//
// The service worker is the single network-call hub. Content scripts
// post messages here to keep CORS and auth concerns out of the page world.

chrome.runtime.onStartup?.addListener(() => {
  console.log('[Hyred] background worker started (browser startup)');
});

chrome.runtime.onInstalled?.addListener(() => {
  console.log('[Hyred] background worker installed/updated');
});

async function getCreds() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['jr_url', 'jr_token'], (v) => resolve(v || {}));
  });
}

async function api(path, init = {}) {
  const { jr_url, jr_token } = await getCreds();
  const base = canonicalBase(jr_url);
  if (!jr_token) {
    return { ok: false, status: 0, error: 'not_connected' };
  }
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${jr_token}`,
    ...(init.headers || {}),
  };
  let res;
  let lastErr;
  // Retry once on a transient network failure — the MV3 service worker often
  // drops its very first fetch right after waking from sleep.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetch(`${base}${path}`, { ...init, headers });
      lastErr = null;
      break;
    } catch (e) {
      lastErr = String(e?.message ?? e);
      if (attempt === 0) await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!res) {
    return { ok: false, status: 0, error: lastErr || 'network_error' };
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  return { ok: res.ok, status: res.status, data };
}

// Canonical API origin — must be www. Apex hyred.in 307-redirects to www.hyred.in;
// fetch() drops the Authorization header on that cross-origin redirect, so verify
// always returned 401 and the token was never saved.
const DEFAULT_URL = 'https://www.hyred.in';

function canonicalBase(url) {
  if (!url) return DEFAULT_URL;
  try {
    const u = new URL(url);
    if (u.hostname === 'hyred.in' || u.hostname === 'www.hyred.in') {
      return DEFAULT_URL;
    }
    return `${u.protocol}//${u.host}`;
  } catch {
    return DEFAULT_URL;
  }
}

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

// Deterministically read the extension JWT the /auth/extension page writes to
// localStorage, from a SPECIFIC tab we control. world:'MAIN' runs in the page's
// own JS context (where localStorage lives). This does not depend on content
// scripts firing or on any server-side postMessage/DOM hook being deployed.
async function readTokenFromTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        try {
          const el = document.getElementById('hyred-ext-token');
          const dom = el && el.getAttribute('data-token');
          if (dom) return dom;
          return localStorage.getItem('hyred_extension_token');
        } catch {
          return null;
        }
      },
    });
    return results?.[0]?.result || null;
  } catch (e) {
    console.warn('[Hyred] readTokenFromTab failed:', e?.message ?? e);
    return null;
  }
}

// Verify a token via the server (background fetch bypasses CORS).
async function verifyToken(token, base) {
  try {
    const res = await fetch(`${canonicalBase(base)}/api/extension/verify`, {
      headers: { authorization: `Bearer ${token}` },
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: String(e?.message ?? e) };
  }
}

/** tabId → timestamp; prevents duplicate cover-letter file uploads during fan-out autofill */
const coverUploadLocks = new Map();

const handlers = {
  // Handshake entry point — called by the hyred.in content script (connect.js)
  // with a freshly-signed extension JWT it picked up from the web app. We
  // verify before saving so a stale/invalid token never overwrites a good one.
  async storeToken({ token } = {}) {
    if (!token) return { ok: false, error: 'no token' };
    const base = DEFAULT_URL;
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
    // Optimistic connectivity: a stored token means connected. Only flip to
    // "not connected" when verify EXPLICITLY rejects the token (401/403).
    // Transient network errors (status 0) or server errors (5xx) must not make
    // a valid, connected user look disconnected.
    if (r.ok) return { connected: true, url: jr_url, verifyStatus: r.status };
    if (r.status === 401 || r.status === 403) {
      return {
        connected: false,
        url: jr_url,
        verifyStatus: r.status,
        verifyError: r.data?.error,
        reason: 'token rejected',
      };
    }
    return {
      connected: true,
      url: jr_url,
      optimistic: true,
      verifyStatus: r.status,
      verifyError: r.error || r.data?.error,
    };
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
  // closing). Deterministic, does not rely on content scripts or unshipped
  // server changes:
  //   1. Best-effort silent cookie exchange (fast path, never blocks).
  //   2. Open the /auth/extension tab we control, then directly read the JWT it
  //      writes to localStorage from THAT exact tab via executeScript. Verify +
  //      save + close the tab.
  async connectExtension() {
    // 1. Fast path: silent cookie exchange.
    const direct = await connectViaCookies();
    if (direct.ok) {
      console.log('[Hyred] connectExtension: connected via cookies');
      return direct;
    }

    // 2. Open the auth tab.
    const authUrl = `${DEFAULT_URL}/auth/extension`;
    let tab;
    try {
      tab = await chrome.tabs.create({ url: authUrl, active: true });
    } catch (e) {
      return { ok: false, error: `could not open auth tab: ${e?.message ?? e}` };
    }

    // 3. Poll the tab's localStorage for the token (set once the page renders
    //    the "Connected!" state). The user may need to log in first.
    const deadline = Date.now() + 60000;
    let token = null;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1000));
      // Stop if the user closed the tab.
      let tabAlive = true;
      try {
        await chrome.tabs.get(tab.id);
      } catch {
        tabAlive = false;
      }
      if (!tabAlive) {
        console.warn('[Hyred] connectExtension: auth tab closed by user');
        break;
      }
      token = await readTokenFromTab(tab.id);
      if (token) break;
    }

    if (!token) {
      console.warn('[Hyred] connectExtension: no token found before timeout');
      return {
        ok: false,
        error: 'auth timeout — sign in on the Hyred tab, then click Connect again',
      };
    }

    // 4. Verify before saving so a stale/invalid token never sticks.
    const v = await verifyToken(token, DEFAULT_URL);
    if (!v.ok) {
      console.warn('[Hyred] connectExtension: token failed verify', v.status, v.error || '');
      return {
        ok: false,
        status: v.status,
        error: `token failed verification (HTTP ${v.status || 'network'})`,
      };
    }

    await new Promise((resolve) =>
      chrome.storage.local.set({ jr_url: DEFAULT_URL, jr_token: token }, resolve),
    );
    try {
      await chrome.tabs.remove(tab.id);
    } catch {
      /* tab may already be closed */
    }
    console.log('[Hyred] connectExtension: token verified + saved');
    return { ok: true, data: { token } };
  },

  async profile() {
    const r = await api('/api/extension/profile');
    if (!r.ok) return { ok: false, error: r.data?.error ?? `HTTP ${r.status}` };
    return { ok: true, profile: r.data.profile };
  },

  async refreshStructure() {
    const r = await api('/api/extension/refresh-structure', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (!r.ok) return { ok: false, error: r.data?.error ?? `HTTP ${r.status}` };
    const pr = await api('/api/extension/profile');
    return {
      ok: true,
      source: r.data?.source,
      work_count: r.data?.work_count,
      warnings: r.data?.warnings,
      profile: pr.ok ? pr.data.profile : undefined,
    };
  },

  async saveStructure(payload) {
    const r = await api('/api/extension/structure', {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    });
    if (!r.ok) return { ok: false, error: r.data?.error ?? `HTTP ${r.status}` };
    return { ok: true, profile: r.data.profile };
  },

  async matchByUrl({ url, title, company, code }) {
    const qs = new URLSearchParams();
    if (url) qs.set('url', url);
    if (title) qs.set('title', title);
    if (company) qs.set('company', company);
    if (code) qs.set('code', code);
    if (!qs.toString()) return { ok: false, error: 'url or hints required' };
    const r = await api(`/api/extension/match-by-url?${qs.toString()}`);
    if (!r.ok) return { ok: false, error: r.data?.error ?? `HTTP ${r.status}` };
    return { ok: true, match: r.data.match };
  },

  async matchById({ match_id }) {
    if (!match_id) return { ok: true, match: null };
    const r = await api(
      `/api/extension/match-by-id?match_id=${encodeURIComponent(match_id)}`,
    );
    if (!r.ok) return { ok: false, error: r.data?.error ?? `HTTP ${r.status}` };
    return { ok: true, match: r.data.match };
  },

  async resolveMatch({ url, title, company, code }) {
    const handoffRes = await handlers.getApplyHandoff();
    const handoff = handoffRes.handoff;

    // Explicit Apply/Optimize handoff beats fuzzy page hints — hints can match a
    // different row (same IRC, duplicate ingest) without tailored_resume_text.
    if (handoff?.matchId) {
      const byId = await handlers.matchById({ match_id: handoff.matchId });
      if (byId.ok && byId.match) {
        const match = { ...byId.match };
        if (handoff.hasTailoredResume && !match.has_tailored_resume) {
          match.has_tailored_resume = true;
        }
        return { ok: true, match, via: 'handoff' };
      }
    }

    if (url || title || code || company) {
      const byUrl = await handlers.matchByUrl({ url, title, company, code });
      if (byUrl.ok && byUrl.match) {
        const match = { ...byUrl.match };
        if (
          handoff?.matchId === match.id &&
          handoff.hasTailoredResume &&
          !match.has_tailored_resume
        ) {
          match.has_tailored_resume = true;
        }
        return { ok: true, match, via: 'url' };
      }
    }

    return { ok: true, match: null };
  },

  async storeApplyHandoff(payload = {}) {
    const existingRes = await handlers.getApplyHandoff();
    const existing = existingRes.handoff;
    const handoff = {
      matchId: payload.matchId ?? existing?.matchId,
      resumeVariant:
        payload.hasTailoredResume != null
          ? payload.hasTailoredResume
            ? 'tailored'
            : 'default'
          : existing?.resumeVariant || 'default',
      hasTailoredResume:
        payload.hasTailoredResume ?? existing?.hasTailoredResume ?? false,
      at: Date.now(),
    };
    await new Promise((resolve) =>
      chrome.storage.local.set({ jr_apply_handoff: handoff }, resolve),
    );
    if (handoff.matchId) {
      await new Promise((resolve) =>
        chrome.storage.local.set(
          { [`jr_resume_choice:${handoff.matchId}`]: handoff.resumeVariant },
          resolve,
        ),
      );
    }
    return { ok: true, handoff };
  },

  async getApplyHandoff() {
    const data = await new Promise((resolve) =>
      chrome.storage.local.get(['jr_apply_handoff'], (v) => resolve(v || {})),
    );
    const handoff = data.jr_apply_handoff;
    if (!handoff?.at || Date.now() - handoff.at > 86_400_000) {
      return { ok: true, handoff: null };
    }
    return { ok: true, handoff };
  },

  async setResumeChoice({ match_id, variant }) {
    if (!match_id || !variant) return { ok: false, error: 'match_id and variant required' };
    await new Promise((resolve) =>
      chrome.storage.local.set({ [`jr_resume_choice:${match_id}`]: variant }, resolve),
    );
    return { ok: true };
  },

  async getResumeChoice({ match_id, has_tailored_resume }) {
    if (!match_id) return { ok: true, variant: 'default' };
    const keys = [`jr_resume_choice:${match_id}`, 'jr_apply_handoff'];
    const data = await new Promise((resolve) =>
      chrome.storage.local.get(keys, (v) => resolve(v || {})),
    );
    const saved = data[`jr_resume_choice:${match_id}`];
    if (saved === 'tailored' || saved === 'default') {
      return { ok: true, variant: saved };
    }
    const handoff = data.jr_apply_handoff;
    if (
      handoff?.matchId === match_id &&
      handoff.at &&
      Date.now() - handoff.at < 86_400_000
    ) {
      return { ok: true, variant: handoff.resumeVariant || 'tailored' };
    }
    return {
      ok: true,
      variant: has_tailored_resume ? 'tailored' : 'default',
    };
  },

  async generateCoverLetter({ match_id } = {}) {
    if (!match_id) return { ok: false, error: 'match_id required' };
    const r = await api('/api/extension/coverletter', {
      method: 'POST',
      body: JSON.stringify({ match_id }),
    });
    if (!r.ok) return { ok: false, error: r.data?.error ?? `HTTP ${r.status}` };
    return { ok: true, cover_letter: r.data.cover_letter };
  },

  async fanOutInjectCoverLetter(payload = {}, sender = {}) {
    const tabId = payload.tabId || sender.tab?.id;
    const text = payload.text;
    if (!tabId || !text) return { ok: false, error: 'tabId and text required' };
    let frames = [];
    try {
      frames = await chrome.webNavigation.getAllFrames({ tabId });
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
    let injected = false;
    for (const frame of frames) {
      try {
        const res = await chrome.tabs.sendMessage(
          tabId,
          { type: 'INJECT_COVER_LETTER', payload: { text } },
          { frameId: frame.frameId },
        );
        if (res?.injected) {
          injected = true;
          break;
        }
      } catch {
        /* frame has no content script */
      }
    }
    return { ok: true, injected };
  },

  /** One cover-letter file upload per tab per autofill pass (Workday fan-out runs many frames). */
  async tryCoverUploadLock(_payload = {}, sender = {}) {
    const tabId = sender.tab?.id;
    if (!tabId) return { ok: false, locked: false, acquired: false };
    const now = Date.now();
    const key = `coverUpload_${tabId}`;
    const prev = coverUploadLocks.get(key) || 0;
    if (now - prev < 30_000) return { ok: false, locked: true, acquired: false };
    coverUploadLocks.set(key, now);
    return { ok: true, locked: false, acquired: true };
  },

  async releaseCoverUploadLock(_payload = {}, sender = {}) {
    const tabId = sender.tab?.id;
    if (!tabId) return { ok: true };
    coverUploadLocks.delete(`coverUpload_${tabId}`);
    return { ok: true };
  },

  async previewResume({ match_id, variant, preview_url } = {}) {
    if (preview_url && variant === 'tailored' && /^https?:\/\//i.test(preview_url)) {
      try {
        await chrome.tabs.create({ url: preview_url, active: true });
        return { ok: true };
      } catch {
        /* fall through to signed preview link */
      }
    }
    const r = await api('/api/extension/resume/preview-link', {
      method: 'POST',
      body: JSON.stringify({
        match_id: match_id || null,
        variant: variant === 'tailored' ? 'tailored' : 'default',
      }),
    });
    if (!r.ok || !r.data?.url) {
      return { ok: false, error: r.data?.error ?? `HTTP ${r.status}` };
    }
    await chrome.tabs.create({ url: r.data.url, active: true });
    return { ok: true };
  },

  async previewCoverLetter({ text } = {}) {
    const letter = String(text || '').trim();
    if (!letter) return { ok: false, error: 'Generate a cover letter first' };
    const escaped = letter
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cover Letter Preview — Hyred</title><style>body{font-family:Georgia,"Times New Roman",serif;max-width:720px;margin:48px auto;padding:0 28px 48px;line-height:1.65;color:#1a1a1a;background:#fafafa}header{font-family:system-ui,sans-serif;border-bottom:1px solid #ddd;padding-bottom:12px;margin-bottom:28px}h1{font-size:13px;font-weight:600;color:#666;margin:0}p{margin:0 0 1em}</style></head><body><header><h1>Hyred — Cover letter preview</h1></header><div>${escaped}</div></body></html>`;
    const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    await chrome.tabs.create({ url, active: true });
    return { ok: true };
  },

  async openHyredJobEdit({ match_id } = {}) {
    const { jr_url, jr_token } = await getCreds();
    const base = canonicalBase(jr_url || DEFAULT_URL);
    if (!match_id) {
      return { ok: false, error: 'Apply from Hyred first to link this job.' };
    }
    const jobUrl = `${base}/jobs/${match_id}`;
    if (!jr_token) {
      const loginUrl = `${base}/login?next=${encodeURIComponent(`/jobs/${match_id}`)}`;
      await chrome.tabs.create({ url: loginUrl, active: true });
      return { ok: true, login: true };
    }
    await chrome.tabs.create({ url: jobUrl, active: true });
    return { ok: true };
  },

  async answerQuestion({ question, match_id, page_text, max_words }) {
    const r = await api('/api/extension/answer', {
      method: 'POST',
      body: JSON.stringify({ question, match_id, page_text, max_words }),
    });
    if (!r.ok) return { ok: false, error: r.data?.error ?? `HTTP ${r.status}` };
    return { ok: true, answer: r.data.answer };
  },

  async mapFields({ fields, profile, job_title, company }) {
    const r = await api('/api/extension/map-fields', {
      method: 'POST',
      body: JSON.stringify({ fields, profile, job_title, company, mode: 'legacy' }),
    });
    if (!r.ok) return { ok: false, error: r.data?.error ?? `HTTP ${r.status}` };
    return { ok: true, mappings: r.data.mappings ?? [] };
  },

  async mapFieldsSemantic({ domain, fields }) {
    const r = await api('/api/extension/map-fields', {
      method: 'POST',
      body: JSON.stringify({ mode: 'semantic', domain, fields }),
    });
    if (!r.ok) return { ok: false, error: r.data?.error ?? `HTTP ${r.status}` };
    return { ok: true, mappings: r.data.mappings ?? [] };
  },

  async getFormTemplate({ domain, structure_hash }) {
    const qs = new URLSearchParams();
    if (domain) qs.set('domain', domain);
    if (structure_hash) qs.set('structure_hash', structure_hash);
    const r = await api(`/api/extension/form-template?${qs.toString()}`);
    if (!r.ok) return { ok: false, error: r.data?.error ?? `HTTP ${r.status}` };
    return {
      ok: true,
      template: r.data.template ?? null,
      capture_count: r.data.capture_count ?? 0,
    };
  },

  async captureFormTemplate(payload) {
    const r = await api('/api/extension/form-template/capture', {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    });
    if (!r.ok) return { ok: false, error: r.data?.error ?? `HTTP ${r.status}` };
    return { ok: true, ...r.data };
  },

  async fetchResume({ match_id, variant } = {}) {
    const parts = [];
    if (match_id) parts.push(`match_id=${encodeURIComponent(match_id)}`);
    if (variant) parts.push(`variant=${encodeURIComponent(variant)}`);
    const q = parts.length ? `?${parts.join('&')}` : '';
    const r = await api(`/api/extension/resume${q}`);
    if (!r.ok) return { ok: false, error: r.data?.error ?? `HTTP ${r.status}` };
    return {
      ok: true,
      filename: r.data.filename,
      content_type: r.data.content_type,
      data_base64: r.data.data_base64,
      variant_used: r.data.variant_used,
    };
  },

  async saveQa({ question, answer }) {
    const r = await api('/api/extension/save-qa', {
      method: 'POST',
      body: JSON.stringify({ question, answer }),
    });
    return { ok: !!r.ok, error: r.ok ? undefined : r.data?.error };
  },

  async markApplied({ match_id }) {
    const r = await api('/api/extension/apply', {
      method: 'POST',
      body: JSON.stringify({ match_id }),
    });
    return { ok: !!r.ok, error: r.ok ? undefined : r.data?.error };
  },

  async clickApplicationContinue(payload = {}, sender = {}) {
    const tabId = payload.tabId || sender.tab?.id;
    if (!tabId) return { ok: false, error: 'no tab' };
    const type = 'CLICK_SAVE_CONTINUE';
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type });
      if (res?.ok) return res;
    } catch {
      /* try other frames */
    }
    let frames = [];
    try {
      frames = await chrome.webNavigation.getAllFrames({ tabId });
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
    for (const frame of frames) {
      try {
        const res = await chrome.tabs.sendMessage(tabId, { type }, { frameId: frame.frameId });
        if (res?.ok) return res;
      } catch {
        /* frame has no content script */
      }
    }
    return { ok: false, error: 'Save / Continue button not found on this page' };
  },

  // Fan out autofill to every frame in the tab (Workday on custom domains embeds
  // the apply form in a cross-origin iframe — top-frame-only fill never runs).
  async fanOutAutofill(payload = {}, sender = {}) {
    const tabId = payload.tabId || sender.tab?.id;
    if (!tabId) return { ok: false, error: 'no tab' };
    const options = { ...(payload.options || {}), fromFanOut: true };
    let frames = [];
    try {
      frames = await chrome.webNavigation.getAllFrames({ tabId });
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
    const outcomes = [];
    for (const frame of frames) {
      try {
        const res = await chrome.tabs.sendMessage(
          tabId,
          { type: 'TRIGGER_AUTOFILL', payload: { options } },
          { frameId: frame.frameId },
        );
        outcomes.push({
          frameId: frame.frameId,
          url: frame.url,
          ok: true,
          res,
        });
      } catch (e) {
        outcomes.push({
          frameId: frame.frameId,
          url: frame.url,
          ok: false,
          error: String(e?.message ?? e),
        });
      }
    }
    const filled = outcomes.reduce((n, o) => n + (o.res?.filled || 0), 0);
    return { ok: true, frames: frames.length, filled, outcomes };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const fn = handlers[msg?.type];
  if (!fn) {
    sendResponse({ ok: false, error: `unknown message ${msg?.type}` });
    return false;
  }
  Promise.resolve(fn(msg.payload || {}, sender))
    .then((res) => sendResponse(res))
    .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
  return true; // keep the channel open for the async response
});

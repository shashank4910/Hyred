// Shared MV3 background messaging — wakes the service worker and retries when
// Chrome reports "Receiving end does not exist" (common after sleep / reboot).
(() => {
  'use strict';

  const TRANSIENT =
    /Receiving end does not exist|message channel closed|message port closed|Could not establish connection/i;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function wakeBackground() {
    try {
      await new Promise((resolve) => chrome.storage.local.get(['jr_url'], resolve));
    } catch {
      /* ignore */
    }
    await sleep(40);
  }

  async function sendBg(type, payload, attempt = 0) {
    const maxAttempts = 8;
    if (attempt === 0) await wakeBackground();

    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };

      const retry = async () => {
        await sleep(Math.min(120 * 2 ** attempt, 1200));
        await wakeBackground();
        done(await sendBg(type, payload, attempt + 1));
      };

      try {
        chrome.runtime.sendMessage({ type, payload }, (res) => {
          const err = chrome.runtime.lastError;
          if (err) {
            const msg = err.message || '';
            if (TRANSIENT.test(msg) && attempt < maxAttempts - 1) {
              retry();
              return;
            }
            done({
              ok: false,
              connected: false,
              error: msg || 'no response',
              workerUnavailable: TRANSIENT.test(msg),
            });
            return;
          }
          done(res ?? { ok: false, error: 'no response' });
        });
      } catch (e) {
        const msg = String(e?.message ?? e);
        if (TRANSIENT.test(msg) && attempt < maxAttempts - 1) {
          retry();
          return;
        }
        done({ ok: false, error: msg, workerUnavailable: TRANSIENT.test(msg) });
      }
    });
  }

  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  root.__HyredSendBg = sendBg;
})();

// Hyred connect handshake — isolated world.
//
// Runs in the extension's isolated content-script world on hyred.in. It
// receives the extension JWT from the page (via window.postMessage emitted by
// connect-main.js, or a DOM hook rendered by /auth/extension) and relays it to
// the background service worker, which verifies + stores it.
//
// This is the modern handshake used by autofill extensions (Simplify, Teal):
// the web app — which already knows the user is logged in and can mint a
// correctly-signed token — hands the token to the extension on its own domain.
// No cookie parsing, no CORS, no stale tokens.

(function () {
  var sent = Object.create(null);

  function relay(token, origin) {
    if (!token || sent[token]) return;
    sent[token] = true;
    try {
      chrome.runtime.sendMessage(
        { type: 'storeToken', payload: { token: token, url: origin || location.origin } },
        function () {
          // Swallow "receiving end does not exist" if the worker is asleep.
          void chrome.runtime.lastError;
        },
      );
    } catch (e) {
      /* extension context may be invalidated on reload */
    }
  }

  // 1. Token broadcast via postMessage (works against current production,
  //    relayed from the MAIN-world reader of localStorage).
  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    var d = e.data;
    if (d && d.source === 'hyred-extension' && d.token) {
      relay(d.token, location.origin);
    }
  });

  // 2. DOM hook the server page can render directly (instant, no MAIN world
  //    needed). The isolated world can read DOM, just not page localStorage.
  function readDom() {
    var el = document.getElementById('hyred-ext-token');
    var t = el && el.getAttribute('data-token');
    if (t) relay(t, location.origin);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', readDom);
  } else {
    readDom();
  }

  try {
    var mo = new MutationObserver(readDom);
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () {
      try {
        mo.disconnect();
      } catch (e) {
        /* ignore */
      }
    }, 20000);
  } catch (e) {
    /* MutationObserver unavailable */
  }
})();

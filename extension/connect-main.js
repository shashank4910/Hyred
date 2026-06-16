// Hyred connect handshake — MAIN world.
//
// Runs in the page's own JS context on hyred.in (NOT the isolated extension
// world), so it can read the page's localStorage. The /auth/extension page
// writes a freshly-signed extension JWT to localStorage under
// `hyred_extension_token`. We read it and broadcast it via window.postMessage,
// which the isolated content script (connect.js) picks up and relays to the
// background worker. This replaces fragile Supabase-cookie scraping.

(function () {
  function emit(token, source) {
    if (!token) return;
    try {
      window.postMessage(
        {
          source: 'hyred-extension',
          kind: 'ext-token',
          token: token,
          from: source,
        },
        window.location.origin,
      );
    } catch (e) {
      /* ignore */
    }
  }

  function readLocalStorage() {
    try {
      var t = localStorage.getItem('hyred_extension_token');
      if (t) emit(t, 'localStorage');
    } catch (e) {
      /* localStorage may be blocked */
    }
  }

  // Read immediately, then retry briefly — the auth page may write the token
  // a moment after this script runs.
  readLocalStorage();
  var n = 0;
  var iv = setInterval(function () {
    n += 1;
    readLocalStorage();
    if (n > 20) clearInterval(iv);
  }, 500);

  // Let the web app explicitly hand us a token if it ever wants to.
  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    var d = e.data;
    if (d && d.source === 'hyred-app' && d.token) emit(d.token, 'app-broadcast');
  });
})();

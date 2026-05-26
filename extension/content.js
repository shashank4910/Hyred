// JobRadar Autofill — content script
//
// Lives on every page (matches <all_urls> in manifest). Detects job
// application forms, renders a floating "Autofill" button on supported
// sites, and orchestrates the fill flow by:
//   1. asking background for the user's profile
//   2. asking background for any JobRadar match for this URL
//      (so we can inject the existing AI cover letter)
//   3. mapping detected form fields to profile values
//   4. AI-answering open-ended screening questions
//   5. pinging /api/extension/apply when the user submits
//
// Everything is wrapped in an IIFE to avoid leaking globals onto the
// host page.

(() => {
  'use strict';

  if (window.__jobRadarLoaded) return;
  window.__jobRadarLoaded = true;

  const log = (...args) => console.log('[JobRadar]', ...args);

  // -------------------------------------------------------------------
  // Send a message to the background and await the response.
  // -------------------------------------------------------------------
  const send = (type, payload) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, payload }, (res) =>
          resolve(res ?? { ok: false, error: 'no response' }),
        );
      } catch (e) {
        resolve({ ok: false, error: String(e?.message ?? e) });
      }
    });

  // -------------------------------------------------------------------
  // Toast helpers — minimal floating notification.
  // -------------------------------------------------------------------
  let toastEl;
  function toast(msg, kind = 'ok', durationMs = 3500) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'jobradar-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.className = `${kind} show`;
    toastEl.textContent = msg;
    clearTimeout(toastEl.__t);
    toastEl.__t = setTimeout(() => toastEl.classList.remove('show'), durationMs);
  }

  // -------------------------------------------------------------------
  // Detect whether the current page is a job application form.
  // We use a generous OR: heuristic count of identifiable input fields
  // OR known-ATS hostname.
  // -------------------------------------------------------------------
  const HOST = location.hostname;

  function detectAts() {
    if (HOST.endsWith('greenhouse.io')) return 'greenhouse';
    if (HOST.endsWith('lever.co')) return 'lever';
    if (HOST.endsWith('ashbyhq.com')) return 'ashby';
    if (HOST.endsWith('workable.com')) return 'workable';
    if (HOST.endsWith('myworkdayjobs.com')) return 'workday';
    if (HOST.endsWith('icims.com')) return 'icims';
    if (HOST.endsWith('bamboohr.com')) return 'bamboohr';
    if (HOST.endsWith('smartrecruiters.com')) return 'smartrecruiters';
    if (HOST.endsWith('recruitee.com')) return 'recruitee';
    if (HOST.endsWith('teamtailor.com')) return 'teamtailor';
    if (HOST.endsWith('jobvite.com')) return 'jobvite';
    if (HOST.endsWith('taleo.net')) return 'taleo';
    if (HOST.endsWith('naukri.com')) return 'naukri';
    if (HOST.endsWith('linkedin.com')) return 'linkedin';
    if (HOST.endsWith('wellfound.com') || HOST.endsWith('angel.co'))
      return 'wellfound';
    if (HOST.endsWith('indeed.com')) return 'indeed';
    return 'generic';
  }

  function looksLikeApplicationForm() {
    // Quick wins
    if (document.querySelector('form[action*="apply"]')) return true;
    if (document.querySelector('form[id*="application"]')) return true;
    if (document.querySelector('form[class*="application"]')) return true;
    // Broad heuristic — count text-y inputs.
    const inputs = document.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input:not([type]), textarea',
    );
    let labelHits = 0;
    inputs.forEach((el) => {
      const sig = `${el.name || ''} ${el.id || ''} ${el.placeholder || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase();
      if (
        /first[_ -]?name|last[_ -]?name|full[_ -]?name|email|phone|resume|cover|linkedin|github|location/.test(
          sig,
        )
      )
        labelHits++;
    });
    return labelHits >= 2;
  }

  // -------------------------------------------------------------------
  // Field mapping: each entry is a list of (regex, profile-getter) pairs.
  // The regex is matched against the lowercased "field signature":
  //   name + id + placeholder + aria-label + nearest <label> text.
  // First match wins, so order matters (most specific first).
  // -------------------------------------------------------------------
  const get = (p, path) =>
    path.split('.').reduce((o, k) => (o ? o[k] : undefined), p);

  const FIELD_RULES = [
    // Name
    [/(^|\b)first[_\s-]*name\b/i, 'first_name'],
    [/(^|\b)given[_\s-]*name\b/i, 'first_name'],
    [/(^|\b)last[_\s-]*name\b/i, 'last_name'],
    [/(^|\b)family[_\s-]*name\b/i, 'last_name'],
    [/(^|\b)surname\b/i, 'last_name'],
    [/(^|\b)full[_\s-]*name\b/i, 'full_name'],
    [/(^|\b)\bname\b(?!.*(company|file|user))/i, 'full_name'],

    // Contact
    [/email/i, 'email'],
    [/phone|mobile|telephone|tel\b/i, 'phone'],

    // Links
    [/linked[\s_-]?in/i, 'links.linkedin'],
    [/github\b|gh[\s_-]?username/i, 'links.github'],
    [/portfolio|website|personal[\s_-]?site/i, 'links.portfolio'],
    [/twitter|x[\s_-]?handle/i, 'links.twitter'],

    // Location
    [/(current[\s_-]?)?city/i, 'location.city'],
    [/state|region|province/i, 'location.region'],
    [/country/i, 'location.country'],
    [/location|address/i, 'location.full'],

    // Career signals
    [/years[_\s-]*of[_\s-]*experience|yoe\b/i, 'years_experience'],
    [/summary|about[_\s-]*you|bio\b/i, 'summary'],
  ];

  // -------------------------------------------------------------------
  // React/Vue-aware setter. Setting `el.value = x` doesn't trigger
  // framework state updates; we have to use the native setter and
  // dispatch an InputEvent so React's onChange fires.
  // -------------------------------------------------------------------
  function setNativeValue(el, value) {
    const proto =
      el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fieldSignature(el) {
    const labelText =
      (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) ||
      el.closest('label')?.textContent ||
      '';
    return [
      el.name,
      el.id,
      el.placeholder,
      el.getAttribute('aria-label'),
      labelText,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .slice(0, 200);
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }

  function isEmpty(el) {
    return !el.value || el.value.trim() === '';
  }

  function looksLikeQuestionTextarea(el) {
    if (el.tagName !== 'TEXTAREA') return false;
    const sig = fieldSignature(el);
    if (
      /resume|cover[_\s]?letter|additional[_\s]?info|paste|upload/.test(sig)
    )
      return false;
    // Must look like a screening question (longer label / sentence).
    return sig.length > 25 && /\?|why|describe|tell|explain|what|how/.test(sig);
  }

  function findCoverLetterField() {
    const candidates = document.querySelectorAll('textarea');
    for (const c of candidates) {
      if (!isVisible(c)) continue;
      const sig = fieldSignature(c);
      if (/cover[_\s]?letter|why[_\s]?(this|us|interested)/.test(sig)) return c;
    }
    return null;
  }

  // -------------------------------------------------------------------
  // Fill basic fields based on the rule table.
  // Returns count of filled fields.
  // -------------------------------------------------------------------
  function fillKnownFields(profile) {
    const inputs = document.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input:not([type]), textarea',
    );
    let n = 0;
    inputs.forEach((el) => {
      if (!isVisible(el) || el.disabled || el.readOnly) return;
      if (!isEmpty(el)) return; // never overwrite user input
      const sig = fieldSignature(el);
      if (!sig) return;
      for (const [re, path] of FIELD_RULES) {
        if (re.test(sig)) {
          const v = get(profile, path);
          if (v != null && String(v).trim() !== '') {
            setNativeValue(el, String(v));
            n++;
          }
          break;
        }
      }
    });
    return n;
  }

  // -------------------------------------------------------------------
  // Inject cover letter into the cover-letter textarea.
  // -------------------------------------------------------------------
  function injectCoverLetter(text) {
    const el = findCoverLetterField();
    if (!el || !text) return false;
    if (!isEmpty(el)) return false;
    setNativeValue(el, text);
    return true;
  }

  // -------------------------------------------------------------------
  // For every empty open-ended textarea that looks like a screening
  // question, ask the LLM to answer based on the resume + JD context.
  // -------------------------------------------------------------------
  async function answerScreeningQuestions(matchId) {
    const targets = [];
    document.querySelectorAll('textarea').forEach((el) => {
      if (!isVisible(el) || el.disabled || el.readOnly) return;
      if (!isEmpty(el)) return;
      if (looksLikeQuestionTextarea(el)) targets.push(el);
    });
    if (!targets.length) return 0;

    let answered = 0;
    // Limit to 5 questions per page to keep token usage reasonable.
    for (const el of targets.slice(0, 5)) {
      const sig = fieldSignature(el);
      const question = sig.length > 200 ? sig.slice(0, 200) : sig;
      const res = await send('answerQuestion', {
        question,
        match_id: matchId,
        page_text: document.body.innerText?.slice(0, 4000),
        max_words: 120,
      });
      if (res.ok && res.answer) {
        setNativeValue(el, res.answer);
        answered++;
      }
    }
    return answered;
  }

  // -------------------------------------------------------------------
  // Hook form-submit to mark the match as 'applied' once the user clicks.
  // We listen at capture phase so we don't miss SPA-managed buttons.
  // -------------------------------------------------------------------
  function attachApplyHook(matchId) {
    if (!matchId || window.__jobRadarHooked) return;
    window.__jobRadarHooked = true;

    document.addEventListener(
      'click',
      (e) => {
        const btn = e.target?.closest?.(
          'button[type="submit"], input[type="submit"], button',
        );
        if (!btn) return;
        const text = (btn.textContent || btn.value || '').trim().toLowerCase();
        if (!/^(submit|apply|send|continue)/.test(text)) return;
        // Fire-and-forget; don't block the click.
        send('markApplied', { match_id: matchId });
        toast('Marked as applied in JobRadar ✓', 'ok');
      },
      true,
    );
  }

  // -------------------------------------------------------------------
  // Main flow when the user clicks the floating button.
  // -------------------------------------------------------------------
  let busy = false;
  async function runAutofill() {
    if (busy) return;
    busy = true;
    const fab = document.getElementById('jobradar-fab');
    if (fab) {
      fab.setAttribute('aria-disabled', 'true');
      fab.querySelector('.jr-label').textContent = 'Working…';
    }
    toast('Filling form...', 'ok', 2000);

    try {
      const ping = await send('ping');
      if (!ping?.connected) {
        toast(
          'Not connected. Open the JobRadar extension popup and sign in.',
          'warn',
          6000,
        );
        return;
      }

      const [profileRes, matchRes] = await Promise.all([
        send('profile'),
        send('matchByUrl', { url: location.href }),
      ]);

      if (!profileRes?.ok) {
        toast(
          `Couldn't load your profile: ${profileRes?.error ?? 'unknown'}`,
          'err',
          6000,
        );
        return;
      }
      const profile = profileRes.profile;
      const match = matchRes?.match ?? null;

      const filled = fillKnownFields(profile);

      let coverInjected = false;
      if (match?.cover_letter) {
        coverInjected = injectCoverLetter(match.cover_letter);
      }

      const answered = await answerScreeningQuestions(match?.id);

      attachApplyHook(match?.id);

      const parts = [];
      parts.push(`Filled ${filled} field${filled === 1 ? '' : 's'}`);
      if (coverInjected) parts.push('cover letter injected');
      if (answered) parts.push(`${answered} screening Q answered`);
      if (match) parts.push(`match score ${match.score}`);
      toast(
        parts.join(' · '),
        filled || coverInjected || answered ? 'ok' : 'warn',
        5500,
      );
      log('autofill complete', { filled, coverInjected, answered, match });
    } catch (e) {
      toast(`Autofill failed: ${e?.message ?? e}`, 'err', 6000);
      log('autofill error', e);
    } finally {
      busy = false;
      if (fab) {
        fab.removeAttribute('aria-disabled');
        fab.querySelector('.jr-label').textContent = 'Autofill';
      }
    }
  }

  // -------------------------------------------------------------------
  // Mount the floating action button.
  // -------------------------------------------------------------------
  function mountFab() {
    if (document.getElementById('jobradar-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'jobradar-fab';
    fab.type = 'button';
    fab.title = 'Autofill with JobRadar';
    fab.innerHTML =
      '<span class="jr-logo">JR</span><span class="jr-label">Autofill</span>';
    fab.addEventListener('click', () => runAutofill());
    document.body.appendChild(fab);
    log('FAB mounted');
  }

  // -------------------------------------------------------------------
  // Listen for messages from the popup ("Autofill this page" button).
  // -------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'TRIGGER_AUTOFILL') {
      mountFab();
      runAutofill();
      sendResponse({ ok: true });
    }
    return false;
  });

  // -------------------------------------------------------------------
  // Auto-mount: known ATS host OR a page that looks like an app form.
  // -------------------------------------------------------------------
  function maybeMount() {
    const ats = detectAts();
    if (ats !== 'generic' || looksLikeApplicationForm()) {
      mountFab();
    }
  }

  log('content script loaded on', HOST, location.pathname);
  maybeMount();
  const obs = new MutationObserver(() => maybeMount());
  obs.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 60_000);
})();

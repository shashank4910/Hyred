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
  const send = (type, payload, _retried) =>
    new Promise((resolve) => {
      let settled = false;
      const done = (v) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      try {
        chrome.runtime.sendMessage({ type, payload }, (res) => {
          const err = chrome.runtime.lastError;
          if (err) {
            const transient =
              /Receiving end does not exist|message channel closed|message port closed/i.test(
                err.message || '',
              );
            if (transient && !_retried) {
              setTimeout(() => done(send(type, payload, true)), 150);
              return;
            }
            const invalidated = /Extension context invalidated/i.test(err.message || '');
            done({
              ok: false,
              connected: false,
              invalidated,
              error: err.message || 'no response',
            });
            return;
          }
          done(res ?? { ok: false, error: 'no response' });
        });
      } catch (e) {
        done({ ok: false, error: String(e?.message ?? e) });
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
  // Simplify-style live fill progress — scroll, highlight, N/M counter.
  // -------------------------------------------------------------------
  const fillUi = {
    active: false,
    total: 0,
    done: 0,
    seen: new Set(),

    begin(estimatedTotal) {
      if (!IS_TOP_FRAME) return;
      this.active = true;
      this.total = Math.max(estimatedTotal, 6);
      this.done = 0;
      this.seen = new Set();
      this.render(0, 'Starting…');
      this.setCardBusy(true);
    },

    setPhase(label) {
      if (!this.active || !IS_TOP_FRAME) return;
      this.render(this.done, label);
    },

    onField(el, label) {
      if (!this.active || !IS_TOP_FRAME || !el) return;
      if (this.seen.has(el)) return;
      this.seen.add(el);
      this.done++;
      if (this.done > this.total) this.total = this.done;
      this.reveal(el);
      const short = (label || labelForControl(el)).replace(/\s+/g, ' ').trim().slice(0, 44);
      this.render(this.done, short || 'field');
    },

    reveal(el) {
      const wrap =
        el.closest(
          '[data-ph-at-id], .field, .form-group, [data-automation-id^="formField"], [class*="question"]',
        ) || el;
      try {
        wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {
        try {
          wrap.scrollIntoView({ block: 'center' });
        } catch {
          /* ignore */
        }
      }
      wrap.classList.remove('jobradar-fill-flash');
      void wrap.offsetWidth;
      wrap.classList.add('jobradar-fill-flash');
      setTimeout(() => wrap.classList.remove('jobradar-fill-flash'), 900);
    },

    render(done, label) {
      const card = document.getElementById('jobradar-card');
      if (!card) return;
      const prog = card.querySelector('.jr-fill-progress');
      const text = card.querySelector('.jr-progress-text');
      const bar = card.querySelector('.jr-progress-fill');
      const btn = card.querySelector('.jr-fill-btn');
      const status = card.querySelector('.jr-card-status');
      const opts = card.querySelector('.jr-card-opts');
      prog?.classList.remove('jr-hidden');
      status?.classList.add('jr-hidden');
      opts?.classList.add('jr-disabled');
      card.classList.add('jr-busy');
      const pct = this.total ? Math.min(100, Math.round((done / this.total) * 100)) : 8;
      if (text) {
        text.textContent =
          done === 0 ? label : `${done}/${this.total} · ${label}`;
      }
      if (bar) bar.style.width = `${Math.max(pct, done === 0 ? 8 : pct)}%`;
      if (btn) {
        btn.disabled = true;
        btn.textContent = done === 0 ? 'Filling…' : `${done}/${this.total}`;
      }
    },

    setCardBusy(on) {
      const card = document.getElementById('jobradar-card');
      if (card) card.classList.toggle('jr-busy', !!on);
      const opts = card?.querySelector('.jr-card-opts');
      if (opts) opts.classList.toggle('jr-disabled', !!on);
      setCardBusy(on);
    },

    end(finalCount, ok = true, statusMsg = '') {
      if (!IS_TOP_FRAME) return;
      const n = finalCount ?? this.done;
      this.active = false;
      const card = document.getElementById('jobradar-card');
      const prog = card?.querySelector('.jr-fill-progress');
      const text = card?.querySelector('.jr-progress-text');
      const bar = card?.querySelector('.jr-progress-fill');
      const status = card?.querySelector('.jr-card-status');
      const btn = card?.querySelector('.jr-fill-btn');
      if (text) {
        text.textContent = statusMsg
          ? statusMsg
          : ok
            ? `${n}/${Math.max(n, this.total)} fields complete ✓`
            : 'No empty fields to fill';
      }
      if (bar) bar.style.width = ok ? '100%' : `${bar.style.width || '0%'}`;
      if (btn) {
        btn.disabled = false;
        btn.textContent = ok ? `${n} filled ✓` : 'Autofill this form';
      }
      prog?.classList.add('jr-done');
      card?.classList.remove('jr-busy');
      card?.querySelector('.jr-card-opts')?.classList.remove('jr-disabled');
      setTimeout(() => {
        prog?.classList.add('jr-hidden');
        prog?.classList.remove('jr-done');
        status?.classList.remove('jr-hidden');
        if (status) {
          status.textContent =
            statusMsg || (ok ? 'Ready to autofill' : 'No empty fields on this page');
          status.className = ok ? 'jr-card-status jr-ok' : 'jr-card-status jr-warn';
        }
        if (btn && btn.textContent.includes('✓')) btn.textContent = 'Autofill this form';
      }, 3200);
    },
  };

  function countEmptyFillableFields() {
    const seen = new Set();
    let n = 0;
    for (const el of scopedFillableElements()) {
      if (!isVisible(el) || el.type === 'hidden' || el.type === 'file') continue;
      if (el.type === 'radio' || el.type === 'checkbox') continue;
      if (!isEmpty(el) || seen.has(el)) continue;
      seen.add(el);
      n++;
    }
    for (const el of applicationFormRoot().querySelectorAll(
      'select, [role="combobox"], button[aria-haspopup="listbox"]',
    )) {
      if (!isVisible(el) || isAutofillExcluded(el) || seen.has(el)) continue;
      const cur = (el.value || el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (cur && !/select|please select|choose one|^search$|^\s*$/.test(cur)) continue;
      seen.add(el);
      n++;
    }
    return n;
  }

  function isConfirmationOrPostApplyPage() {
    const url = `${location.pathname}${location.search}`.toLowerCase();
    if (
      /applicationconfirmation|application.?confirm|thank.?you|thankyou|apply.?complete|application.?submitted|submission.?confirm|already.?applied|apply.?success|post.?apply|application.?complete/i.test(
        url,
      )
    ) {
      return true;
    }
    const hay = document.body?.innerText?.slice(0, 6000).toLowerCase() || '';
    return (
      /thank you for applying|application has been submitted|application received|successfully submitted|your application was submitted/i.test(
        hay,
      ) && countEmptyFillableFields() < 2
    );
  }

  function shouldShowCopilotCard() {
    if (isConfirmationOrPostApplyPage()) return false;
    const empty = countEmptyFillableFields();
    if (empty >= 1) return true;
    const resumeIn = findResumeFileInput();
    if (resumeIn && !resumeIn.files?.length) return true;
    if ((isWorkdayDom() || isUniversalCareerSite()) && empty >= 1) return true;
    return looksLikeApplicationForm() && empty >= 2;
  }

  function estimateFillTargetCount() {
    return Math.min(Math.max(countEmptyFillableFields(), 5), 48);
  }

  function autofillSuccessCount(filled, resumeUploaded, coverInjected, answered) {
    return filled + (resumeUploaded ? 1 : 0) + (coverInjected ? 1 : 0) + answered;
  }

  // -------------------------------------------------------------------
  // Detect whether the current page is a job application form.
  // We use a generous OR: heuristic count of identifiable input fields
  // OR known-ATS hostname.
  // -------------------------------------------------------------------
  const HOST = location.hostname;

  /** Long-tail career sites (Phenom, custom domains, vendor-tagged forms) → universal ATS config. */
  function isUniversalCareerSite() {
    if (/phenompeople\.com/i.test(HOST)) return true;
    for (const s of document.querySelectorAll('script[src], link[href]')) {
      const url = s.getAttribute('src') || s.getAttribute('href') || '';
      if (/phenompeople\.com/i.test(url)) return true;
    }
    if (document.querySelector('[data-ph-at-id], [data-ph-id], [data-phenom], [class*="phw-"]')) {
      return true;
    }
    try {
      if (window.Phenom || window.PhenomPeople) return true;
    } catch {
      /* cross-origin */
    }
    return false;
  }

  function isPhenomDom() {
    return isUniversalCareerSite();
  }

  function isWorkdayDom() {
    if (isUniversalCareerSite()) return false;
    if (
      document.querySelector('[data-automation-id^="formField"]') ||
      document.querySelector('[data-automation-id="multiselectInputContainer"]') ||
      document.querySelector('[data-automation-id="promptIcon"]') ||
      document.querySelector('[data-automation-id="file-upload-input-ref"]') ||
      document.querySelector('[data-automation-id="applyFlowPrimaryButton"]') ||
      document.querySelector('[data-automation-id="candidateProfile"]')
    ) {
      return true;
    }
    const hay = document.body?.innerText?.slice(0, 10000).toLowerCase() || '';
    const hasWdAid = !!document.querySelector('[data-automation-id]');
    return (
      hasWdAid &&
      (/given name|family name|my information/.test(hay) &&
        /how did you hear|phone device type|country phone code/.test(hay)) ||
      /voluntary disclosures|type to add skills/.test(hay)
    );
  }

  function isWorkdaySite() {
    if (HOST.endsWith('myworkdayjobs.com')) return true;
    return isWorkdayDom();
  }

  function detectAts() {
    // Custom career pages + long-tail ATS → universal config adapter (ats-fill).
    // Platform-specific adapters only for Workday, Lever, Greenhouse, etc.
    if (isWorkdaySite()) return 'workday';
    if (HOST.endsWith('greenhouse.io')) return 'greenhouse';
    if (HOST.endsWith('lever.co')) return 'lever';
    if (HOST.endsWith('ashbyhq.com')) return 'ashby';
    if (HOST.endsWith('workable.com')) return 'workable';
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

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Simplify-style field rules: regex on label signature → profile path.
  const FIELD_RULES = [
    [/(^|\b)first[_\s-]*name\b/i, 'first_name'],
    [/(^|\b)given[_\s-]*name\b/i, 'first_name'],
    [/(^|\b)fname\b/i, 'first_name'],
    [/\bfirstname\b/i, 'first_name'],
    [/(^|\b)last[_\s-]*name\b/i, 'last_name'],
    [/(^|\b)family[_\s-]*name\b/i, 'last_name'],
    [/(^|\b)lname\b/i, 'last_name'],
    [/\blastname\b|\bfamilyname\b/i, 'last_name'],
    [/(^|\b)surname\b/i, 'last_name'],
    [/(^|\b)full[_\s-]*name\b/i, 'full_name'],
    [/(^|\b)preferred[_\s-]*name\b/i, 'full_name'],
    [/(^|\b)\bname\b(?!.*(company|file|user|school|university|employer))/i, 'full_name'],

    [/e-?mail/i, 'email'],
    [/phone|mobile|telephone|\btel\b|contact[_\s-]*number/i, 'phone'],

    [/linked[\s_-]?in/i, 'links.linkedin'],
    [/github\b|gh[\s_-]?username/i, 'links.github'],
    [/portfolio|personal[\s_-]?site|website|homepage/i, 'links.portfolio'],
    [/twitter|x[\s_-]?handle|x\.com/i, 'links.twitter'],

    [/(current[\s_-]?)?city\b|town\b/i, 'location.city'],
    [/state|region|province/i, 'location.region'],
    [/country(?!.*(authorization|auth))/i, 'location.country'],
    [/zip|postal|pin\s*code|postcode/i, 'zip_code'],
    [/street|address\s*line|addr(?!ess)/i, 'location.full'],
    [/location|current\s*location/i, 'location.full'],

    [/job[_\s-]*title|current[_\s-]*title|position\b/i, 'current_title'],
    [/\borg\b|current[_\s-]*company|employer/i, 'latest_company'],
    [/years?[_\s-]*of[_\s-]*experience|yoe\b|experience\s*years/i, 'years_experience'],
    [/current[_\s-]*(ctc|salary)|present[_\s-]*salary/i, 'total_ctc'],
    [/expected[_\s-]*(ctc|salary)|desired[_\s-]*salary|salary[_\s-]*expect/i, 'expected_ctc'],
    [/notice[_\s-]*period|availability|joining/i, 'notice_period'],
    [/available[_\s-]*(from|date)/i, 'available_from'],
    [/work[_\s-]*type|remote|hybrid|onsite/i, 'preferred_work_type'],
    [/travel/i, 'willing_to_travel'],
    [/relocat/i, 'relocation_cities'],

    [/gender\b/i, 'gender'],
    [/university|college|school/i, 'education.0.school'],
    [/field of study|\bmajor\b/i, 'education.0.field'],
    [/\bdegree\b/i, 'education.0.degree'],
    [/veteran/i, 'veteran_status'],
    [/disabilit/i, 'disability_status'],
    [/ethnic|race\b/i, 'ethnicity'],

    [/summary|about[_\s-]*you|professional[_\s-]*summary|bio\b/i, 'summary'],
    [/about\s*yourself/i, 'answer_about_yourself'],
    [/why.*(leave|interested|apply|role|company|us)/i, 'answer_why_leave'],
    [/strength/i, 'answer_strengths'],
    [/weakness/i, 'answer_weaknesses'],
  ];

  // -------------------------------------------------------------------
  // Rich label extraction (Simplify / FormPilot style priority chain).
  // -------------------------------------------------------------------
  function labelForControl(el) {
    const bits = [];
    const aria = el.getAttribute('aria-label');
    if (aria) bits.push(aria);
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      labelledBy.split(/\s+/).forEach((id) => {
        const n = document.getElementById(id);
        if (n?.textContent) bits.push(n.textContent);
      });
    }
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl?.textContent) bits.push(lbl.textContent);
    }
    const closestLabel = el.closest('label');
    if (closestLabel?.textContent) bits.push(closestLabel.textContent);
    if (el.placeholder) bits.push(el.placeholder);
    if (el.name) bits.push(el.name);
    if (el.id) bits.push(el.id);
    const phAt =
      el.getAttribute('data-ph-at-id') ||
      el.getAttribute('data-ph-id') ||
      el.getAttribute('data-field') ||
      el.closest('[data-ph-at-id], [data-ph-id]')?.getAttribute('data-ph-at-id') ||
      el.closest('[data-ph-at-id], [data-ph-id]')?.getAttribute('data-ph-id') ||
      '';
    if (phAt) bits.push(phAt.replace(/([a-z])([A-Z])/g, '$1 $2'));
    const fieldset = el.closest('fieldset');
    const legend = fieldset?.querySelector('legend');
    if (legend?.textContent) bits.push(legend.textContent);
    const group =
      el.closest(
        '.field, .form-group, .form-field, .application-field, [class*="question"], [class*="phw-"], [data-ph-at-id]',
      ) || el.parentElement;
    if (group) {
      const gl = group.querySelector(
        'label, .label, .question, h3, h4, p, [class*="phw-label"], [class*="field-label"]',
      );
      if (gl?.textContent && gl !== el) bits.push(gl.textContent);
    }
    let sib = el.previousElementSibling;
    for (let i = 0; i < 2 && sib; i++, sib = sib.previousElementSibling) {
      if (sib.textContent?.trim()) bits.push(sib.textContent);
    }
    return bits.join(' ').replace(/\s+/g, ' ').trim();
  }

  function fieldSignature(el) {
    const ancAid =
      el.closest('[data-automation-id]')?.getAttribute('data-automation-id') || '';
    const phenomOwn = el.getAttribute('data-ph-at-id') || el.getAttribute('data-ph-id') || '';
    const phenomAnc =
      el.closest('[data-ph-at-id], [data-ph-id]')?.getAttribute('data-ph-at-id') ||
      el.closest('[data-ph-at-id], [data-ph-id]')?.getAttribute('data-ph-id') ||
      '';
    return [
      labelForControl(el),
      el.name,
      el.id,
      el.placeholder,
      el.getAttribute('aria-label'),
      el.getAttribute('data-testid'),
      el.getAttribute('data-automation-id'),
      ancAid,
      phenomOwn,
      phenomAnc,
      el.getAttribute('data-qa'),
      el.getAttribute('autocomplete'),
      el.type,
      el.getAttribute('role'),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .slice(0, 400);
  }

  function applicationFormRoot() {
    const selectors = [
      '#apply-form-renderer',
      '[class*="apply-form-renderer"]',
      '[class*="applyForm"]',
      '[class*="job-application"]',
      '[class*="pcs-apply"]',
      '#pcs-form',
      '[id*="apply-form"]',
      'main [class*="application"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    const ph = document.querySelector('[data-ph-at-id], [data-ph-id]');
    if (ph) {
      return (
        ph.closest('main, [role="main"], form, section, [class*="apply"], #content') ||
        document.body
      );
    }
    return document.querySelector('form') || document.body;
  }

  function isAutofillExcluded(el) {
    if (!el?.closest) return true;
    if (
      el.closest(
        'header, nav, footer, [role="banner"], [role="navigation"], [class*="header"], [class*="navbar"], [class*="global-search"], [class*="job-search"], [class*="site-search"]',
      )
    ) {
      return true;
    }
    const sig = fieldSignature(el);
    return /gllocation|searchjob|search.job|search.location|typeahead.?job|site.?search|keyword.?search|locationinput.*search/i.test(
      sig,
    );
  }

  function scopedFillableElements() {
    const root = applicationFormRoot();
    return collectFillableElements(root).filter((el) => !isAutofillExcluded(el));
  }

  function collectFillableElements(root = document) {
    const out = [];
    const seen = new Set();
    const walk = (node) => {
      if (!node || node.nodeType !== 1) return;
      const el = node;
      const tag = el.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (el.isContentEditable && el.getAttribute('contenteditable') !== 'false') ||
        el.getAttribute('role') === 'combobox'
      ) {
        if (!seen.has(el)) {
          seen.add(el);
          out.push(el);
        }
      }
      if (el.shadowRoot) walk(el.shadowRoot);
      for (const child of el.children || []) walk(child);
    };
    walk(root);
    return out;
  }

  // -------------------------------------------------------------------
  // React/Vue-aware setter + focus/blur (required for modern ATS forms).
  // SPA / Vue / React forms often ignore one-shot .value assignment — type incrementally.
  // -------------------------------------------------------------------
  function phoneDigitsOnly(phone, stripCountryCode) {
    let d = String(phone || '').replace(/[^\d]/g, '');
    const cc = String(stripCountryCode || '').replace(/\D/g, '');
    if (cc && d.startsWith(cc)) d = d.slice(cc.length);
    if (d.length > 10) d = d.slice(-10);
    return d;
  }

  function countryCodeDigits(profile, el) {
    const root = el?.closest('[data-ph-at-id], .field, .form-group') || applicationFormRoot();
    const hay = (root?.textContent || '').toLowerCase();
    const m = hay.match(/\+(\d{1,3})/);
    if (m) return m[1];
    const country = profile.location?.country || profile.work_auth_country || '';
    if (/india/i.test(country)) return '91';
    return '';
  }

  function isPhoneNumberField(el, sig) {
    if (/country code|device type|phone code|dial code/i.test(sig)) return false;
    return (
      el.type === 'tel' ||
      /mobile.?number|phone.?number|\bphone\b|\bmobile\b|phonenumber/i.test(sig)
    );
  }

  function isSalutationTitleSig(sig) {
    if (/job title|current title|position title|designation|employer title/i.test(sig)) {
      return false;
    }
    return /(^|\W)\*?title(\W|$)|salutation|^prefix\b|title mr|title ms|title dr/i.test(sig);
  }

  function salutationPrefs(profile) {
    const g = String(profile.gender || '').toLowerCase();
    if (/female|woman/.test(g)) return ['ms.', 'ms', 'mrs.', 'mrs'];
    if (/male|man/.test(g)) return ['mr.', 'mr'];
    return ['mr.', 'mr', 'ms.', 'ms'];
  }

  function normalizeFilledValue(el, path, raw, profile) {
    if (raw == null) return null;
    let val = String(raw).trim();
    if (!val) return null;
    const sig = fieldSignature(el);
    if (path === 'phone' || isPhoneNumberField(el, sig)) {
      return phoneDigitsOnly(val, countryCodeDigits(profile, el));
    }
    if (path === 'zip_code' || /pin.?code|postal|zipcode|postcode/i.test(sig)) {
      const zip = profile.zip_code || val;
      const digits = String(zip).replace(/[^\dA-Za-z-]/g, '');
      if (digits.length >= 4) return digits.slice(0, 10);
      return null;
    }
    if (path === 'location.city' && val.includes(',')) {
      return val.split(',')[0].trim();
    }
    if (path === 'location.full' && /pin.?code|postal|zipcode/i.test(sig)) {
      return normalizeFilledValue(el, 'zip_code', profile.zip_code, profile);
    }
    return val;
  }

  function hasFrameworkBinding(node) {
    if (!node || node.nodeType !== 1) return false;
    try {
      if (node.__vue__ || node.__vueParentComponent || node._reactRootContainer) return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  function usesReactiveBinding(el) {
    if (!el?.closest) return false;
    if (
      el.closest(
        '[data-ph-at-id], [data-ph-id], [data-field], [data-field-id], [data-form-field], [class*="pcs-"], [class*="phw-"], [data-reactroot], [data-v-app], [ng-version], [class*="ember-"]',
      )
    ) {
      return true;
    }
    for (let n = el; n; n = n.parentElement) {
      if (hasFrameworkBinding(n)) return true;
    }
    return false;
  }

  function setNativeValue(el, value) {
    const str = String(value ?? '');
    try {
      el.focus?.({ preventScroll: true });
    } catch {
      /* ignore */
    }

    if (el.isContentEditable) {
      el.textContent = str;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: str }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      return;
    }

    if (el.tagName === 'SELECT') {
      setSelectValue(el, str);
      return;
    }

    const proto =
      el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set) desc.set.call(el, str);
    else el.value = str;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: str }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  async function typeIncrementalValue(input, value) {
    const str = String(value ?? '');
    try {
      input.focus?.({ preventScroll: true });
    } catch {
      /* ignore */
    }
    const proto = window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set) desc.set.call(input, '');
    else input.value = '';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    await sleep(40);
    let acc = '';
    for (const ch of str) {
      acc += ch;
      if (desc?.set) desc.set.call(input, acc);
      else input.value = acc;
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ch }));
      input.dispatchEvent(
        new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }),
      );
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ch }));
      await sleep(16);
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  async function setFieldValue(el, value, label) {
    if (fillUi.active && IS_TOP_FRAME) {
      fillUi.onField(el, label);
      await sleep(160);
    }
    if (
      usesReactiveBinding(el) &&
      (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') &&
      !el.readOnly
    ) {
      await typeIncrementalValue(el, value);
      return;
    }
    setNativeValue(el, value);
  }

  function setSelectValue(el, value) {
    const want = String(value).toLowerCase().trim();
    if (!want) return false;
    let matched = null;
    for (const opt of el.options) {
      const ov = (opt.value || '').toLowerCase();
      const ot = (opt.textContent || '').toLowerCase().trim();
      if (ov === want || ot === want || ot.includes(want) || want.includes(ot)) {
        matched = opt;
        break;
      }
    }
    if (!matched) return false;
    el.value = matched.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.type === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0 && el.tagName !== 'SELECT') return false;
    const cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }

  function isEmpty(el) {
    if (el.tagName === 'SELECT') return !el.value || el.selectedIndex <= 0;
    if (el.type === 'checkbox' || el.type === 'radio') return !el.checked;
    if (el.isContentEditable) return !el.textContent?.trim();
    return !el.value || el.value.trim() === '';
  }

  function looksLikeUrl(v) {
    const s = String(v ?? '').trim();
    if (!s || /^(yes|no|n\/a|none|not applicable)$/i.test(s)) return false;
    return (
      /^https?:\/\//i.test(s) ||
      /^www\./i.test(s) ||
      /\.(com|org|net|io|in|co|dev)\b/i.test(s)
    );
  }

  function isUrlLikeField(sig, el) {
    if (el?.type === 'url') return true;
    return /facebook|linkedin|twitter|instagram|github|social[\s_-]*network|profile\s*url|\burl\b|website|portfolio|x\.com/i.test(
      sig,
    );
  }

  function looksLikeGpa(v) {
    const s = String(v ?? '').trim();
    return /^\d+(\.\d+)?(\s*\/\s*\d+)?$/.test(s);
  }

  function shouldAcceptValue(el, sig, value) {
    const v = String(value ?? '').trim();
    if (!v) return false;
    if (isUrlLikeField(sig, el) && !looksLikeUrl(v)) return false;
    if (/gpa|overall result|grade point/i.test(sig) && !looksLikeGpa(v)) return false;
    return true;
  }

  function workdayFieldLabel(node) {
    const field =
      node.closest?.('[data-automation-id^="formField"]') ||
      ((node.getAttribute?.('data-automation-id') || '').startsWith('formField') ? node : null);
    if (field) {
      const rich = field.querySelector(
        '[data-automation-id="richText"] label, [data-automation-id="richText"], label',
      );
      if (rich?.textContent) {
        const t = rich.textContent.replace(/\s+/g, ' ').trim();
        if (t && !/^select one/i.test(t)) return t;
      }
      const clone = field.cloneNode(true);
      clone
        .querySelectorAll('button, input, textarea, select, [role="listbox"]')
        .forEach((n) => n.remove());
      const inner = (clone.textContent || '').replace(/\s+/g, ' ').trim();
      if (inner && inner.length < 120) return inner;
    }
    return labelForControl(node);
  }

  function fieldOfStudyFromDegree(degree) {
    if (!degree) return null;
    const m = String(degree).match(/\bin\s+(.+)/i);
    return m?.[1]?.trim() || null;
  }

  function parseJobDateParts(raw) {
    if (window.__JobRadarAtsFill?.parseDateParts) {
      return window.__JobRadarAtsFill.parseDateParts(raw);
    }
    const s = String(raw ?? '').trim();
    if (!s) return {};
    if (/present|current|now/i.test(s)) return { present: true };
    const months = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    let month;
    let year;
    const my = s.match(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s*['']?(\d{2,4})\b/i,
    );
    if (my) {
      month = months[my[1].toLowerCase().slice(0, 3)];
      year = my[2].length === 2 ? `20${my[2]}` : my[2];
    }
    const yOnly = s.match(/\b(19|20)\d{2}\b/);
    if (!year && yOnly) year = yOnly[0];
    return { month, year, present: false };
  }

  function workdayExperienceRowScope(row) {
    if (!row) return row;
    const fromRow = (row.getAttribute('data-automation-id') || '').match(/^(workExperience-\d+)/i);
    if (fromRow) {
      const root = document.querySelector(`[data-automation-id="${fromRow[1]}"]`);
      if (root) return root;
    }
    const titleEl = row.querySelector(
      'input[data-automation-id="jobTitle"], input[name="jobTitle"], input[id*="jobTitle" i]',
    );
    const fromTitle = (titleEl?.id || '').match(/workExperience-(\d+)/i);
    if (fromTitle) {
      const root = document.querySelector(`[data-automation-id="workExperience-${fromTitle[1]}"]`);
      if (root) return root;
    }
    return row;
  }

  function isLikelyCityName(val, profile) {
    if (!val) return false;
    const v = String(val).trim().toLowerCase();
    const city = profile?.location?.city?.toLowerCase();
    const region = profile?.location?.region?.toLowerCase();
    if (city && v === city) return true;
    if (region && v === region) return true;
    return /^(chennai|bangalore|bengaluru|mumbai|delhi|gurgaon|gurugram|hyderabad|pune|noida|kolkata|ahmedabad|jaipur|lucknow|indore|coimbatore|kochi|thiruvananthapuram|visakhapatnam|bhopal|chandigarh|faridabad|ghaziabad|nagpur|surat|vadodara)$/i.test(
      v,
    );
  }

  function resolveEducationFieldOfStudy(edu, profile) {
    const raw = edu?.field?.trim();
    if (
      raw &&
      !isLikelyInvalidFieldOfStudy(raw) &&
      !isLikelyCityName(raw, profile) &&
      !/^(19|20)\d{2}$/.test(raw)
    ) {
      return raw.split(/\s*[-–—|]\s*/)[0].trim() || raw;
    }
    const fromDegree = fieldOfStudyFromDegree(edu?.degree);
    if (fromDegree && !isLikelyInvalidFieldOfStudy(fromDegree)) return fromDegree;
    const d = String(edu?.degree || '').toLowerCase();
    if (/\bb\.?tech\b|\binformation technology\b/i.test(d)) return 'Information Technology';
    if (/\bcomputer\b/i.test(d)) return 'Computer Science';
    if (/\belectronics\b/i.test(d)) return 'Electronics';
    return null;
  }

  function isLikelyInvalidFieldOfStudy(val) {
    if (!val) return true;
    if (/university|college|institute|school|\bsrm\b/i.test(val)) return true;
    if (val.length > 40) return true;
    return false;
  }

  function typeaheadSearchTerms(value) {
    const v = String(value || '').trim();
    if (!v) return [];
    const primary = v.split(/\s*[-–—|]\s*/)[0].trim();
    const out = [];
    if (primary) out.push(primary);
    for (const n of [3, 2, 1]) {
      const w = primary.split(/\s+/).slice(0, n).join(' ');
      if (w.length >= 2) out.push(w);
    }
    return [...new Set(out)];
  }

  function workdayAddButtonLabel(btn) {
    return (btn.textContent || btn.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
  }

  function isWorkdayAddButton(btn) {
    const label = workdayAddButtonLabel(btn);
    if (!label) return false;
    if (/^add(\s+another)?$/i.test(label) || /\badd\s+another\b/i.test(label)) return true;
    if (/^add$/i.test(label.split(/\s+/).filter(Boolean)[0] || '')) return true;
    const aid = (btn.getAttribute('data-automation-id') || '').toLowerCase();
    return /^add(-button)?$/.test(aid) || /addbutton|addanother/.test(aid);
  }

  function isWorkdayClickable(el) {
    if (!el || !isVisible(el)) return false;
    const tag = el.tagName?.toLowerCase();
    if (tag === 'button' || tag === 'a') return true;
    const role = el.getAttribute('role');
    if (role === 'button') return true;
    const aid = (el.getAttribute('data-automation-id') || '').toLowerCase();
    if (/add(-button)?$/.test(aid) || aid.includes('addbutton')) return true;
    return el.tabIndex >= 0 && isWorkdayAddButton(el);
  }

  function findWorkdaySectionAddButton(sectionTitleRe) {
    const headings = [
      ...document.querySelectorAll(
        'h1,h2,h3,h4,legend,[data-automation-id="richText"],[data-automation-id^="formLabel"]',
      ),
    ];
    const heading = headings.find((h) => sectionTitleRe.test((h.textContent || '').replace(/\s+/g, ' ').trim()));
    if (!heading) return null;

    let node = heading;
    for (let depth = 0; depth < 10 && node; depth++) {
      const clickables = [
        ...node.querySelectorAll(
          'button, [role="button"], [data-automation-id="add-button"], [data-automation-id*="add-button" i], [data-automation-id*="addButton" i], a',
        ),
      ].filter((b) => isWorkdayClickable(b) && isWorkdayAddButton(b));
      if (clickables.length) return clickables[clickables.length - 1];
      node = node.parentElement;
    }

    let sib = heading.parentElement;
    for (let i = 0; i < 6 && sib; i++) {
      const clickables = [...sib.querySelectorAll('[data-automation-id="add-button"], [data-automation-id*="add-button" i]')].filter(
        (b) => isWorkdayClickable(b),
      );
      if (clickables.length) return clickables[0];
      sib = sib.nextElementSibling;
    }
    return null;
  }

  async function workdayClick(el) {
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    await sleep(120);
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    el.click();
  }

  function isNonExperienceAddSection(aids) {
    return /education|skill|language|website|social|resume|cv|certification/i.test(aids);
  }

  function normalizeWorkdayDegree(degree) {
    const d = String(degree || '').toLowerCase();
    if (/\b(ph\.?d|doctorate|doctor)\b/.test(d)) return 'Doctorate';
    if (/\b(mba|m\.?b\.?a|master)\b/.test(d)) return 'Master';
    if (/\b(associate|a\.?a\.?)\b/.test(d)) return 'Associate';
    if (/\b(b\.?tech|b\.?e\.?|bachelor|b\.?s\.?|b\.?a\.?)\b/.test(d)) return 'Bachelor';
    return degree;
  }

  function jobLocationFromEntry(job) {
    if (job?.location?.trim()) return job.location.trim();
    const c = job?.company || '';
    const m = c.match(/,\s*([^,]+)$/);
    return m?.[1]?.trim() || null;
  }

  function isWorkdayDedicatedField(sig) {
    const s = String(sig || '').toLowerCase();
    return (
      /workexperience|datesection(?:month|day|year)|startdate|enddate|firstyearattended|lastyearattended|roleDescription|currentlyworkhere|jobtitle|companyname|formfield-skills|schoolname|education-\d+--school/.test(
        s,
      ) ||
      (/facebook/.test(s) && /willing|share/.test(s)) ||
      (/linked/.test(s) && /willing|share|profile with us/i.test(s))
    );
  }

  function isValidWorkdayYear(val) {
    return /^(19|20)\d{2}$/.test(String(val ?? '').trim());
  }

  function isValidWorkdayMonth(val) {
    const m = String(val ?? '').trim();
    return /^(0?[1-9]|1[0-2])$/.test(m);
  }

  async function setWorkdayDatePart(el, value) {
    const v = String(value ?? '').trim();
    if (!v || !el) return false;
    const normalized = v.length === 1 && /^\d$/.test(v) ? `0${v}` : v;
    if (el.getAttribute('role') === 'spinbutton' || usesReactiveBinding(el)) {
      await typeIncrementalValue(el, normalized);
    } else {
      setNativeValue(el, normalized);
    }
    await sleep(80);
    return true;
  }

  async function clearInvalidWorkdayDateEl(el) {
    if (!el || isEmpty(el)) return;
    const v = (el.value || '').trim();
    const ctx = `${el.id || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase();
    if (/year/i.test(ctx) && v && !isValidWorkdayYear(v)) {
      setNativeValue(el, '');
      log('workday:date cleared invalid year', v.slice(0, 20));
    } else if (/month/i.test(ctx) && v && !isValidWorkdayMonth(v) && !/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(v)) {
      setNativeValue(el, '');
      log('workday:date cleared invalid month', v.slice(0, 20));
    }
  }

  function isAutofillableWorkJob(job) {
    const t = (job?.title || '').trim();
    const c = (job?.company || '').trim();
    if (!t || !c) return false;
    if (/^(present|current|now)$/i.test(t) || /^(present|current|now)$/i.test(c)) return false;
    if (
      /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t) ||
      /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(c)
    ) {
      return /\b(engineer|developer|manager|analyst|tester|performance|consultant)\b/i.test(t);
    }
    return /\b(engineer|developer|manager|analyst|tester|performance|consultant|analyst)\b/i.test(t);
  }

  function shouldSkipWorkExperience(profile) {
    const ps = profile?.profile_structure;
    if (!ps?.extracted_at) return false;
    return ps.readiness !== 'ready';
  }

  function valueForPath(profile, path) {
    const v = get(profile, path);
    if (v == null) return null;
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    const s = String(v).trim();
    return s || null;
  }

  function matchRule(sig, rules = FIELD_RULES) {
    const s = String(sig).toLowerCase();
    if (
      /workexperience|datesection|startdate|enddate|roleDescription|currentlyworkhere|jobtitle|companyname/.test(
        s,
      )
    ) {
      return null;
    }
    if (/schoolname|education-\d+--school/.test(s)) return null;
    if (/facebook/.test(s) && /willing|share/.test(s)) return null;
    if (/years?[_\s-]*of[_\s-]*experience|yoe\b|experience\s*years/i.test(s) && /workexperience|datesection/.test(s)) {
      return null;
    }
    for (const [re, path] of rules) {
      if (!re.test(sig)) continue;
      if (path === 'education.0.degree' && /gpa|overall result|grade point/i.test(sig)) continue;
      if (path === 'education.0.field' && /gpa|overall result|grade point/i.test(sig)) continue;
      if (path.startsWith('links.') && /school|university|college|education|gpa|degree\b/i.test(sig))
        continue;
      return path;
    }
    return null;
  }

  function matchCustomQa(sig, customQa) {
    if (!Array.isArray(customQa) || !customQa.length) return null;
    const norm = sig.replace(/\s+/g, ' ').trim();
    let best = null;
    let bestScore = 0;
    for (const row of customQa) {
      const q = String(row.question || '').toLowerCase().trim();
      if (!q || !row.answer) continue;
      if (norm.includes(q) || q.includes(norm.slice(0, 80))) {
        const score = Math.min(q.length, norm.length);
        if (score > bestScore) {
          bestScore = score;
          best = row.answer;
        }
      }
    }
    return best;
  }

  function looksLikeQuestionTextarea(el) {
    if (el.tagName !== 'TEXTAREA' && !el.isContentEditable) return false;
    const sig = fieldSignature(el);
    if (/resume|cover[_\s]?letter|additional[_\s]?info|paste|upload/.test(sig))
      return false;
    return sig.length > 20 && /\?|why|describe|tell|explain|what|how/.test(sig);
  }

  function findCoverLetterField() {
    for (const c of collectFillableElements()) {
      if (c.tagName !== 'TEXTAREA' && !c.isContentEditable) continue;
      if (!isVisible(c)) continue;
      const sig = fieldSignature(c);
      if (/cover[_\s]?letter|motivation|why[_\s]?(this|us|interested)/.test(sig))
        return c;
      if (c.name === 'comments' && /additional|comments/i.test(sig)) return c;
    }
    return null;
  }

  async function fillLeverTypeahead(input, value) {
    if (!input || !value) return false;
    const str = String(value).trim();
    setNativeValue(input, str);
    await sleep(450);
    const selectors = [
      '.tt-suggestion',
      '.tt-menu .tt-selectable',
      '.dropdown-menu .dropdown-item',
      '.dropdown-menu li',
      '[role="listbox"] [role="option"]',
      '.application-dropdown li',
      '.menu-content li',
    ];
    const want = str.toLowerCase();
    for (const sel of selectors) {
      const opts = [...document.querySelectorAll(sel)].filter(isVisible);
      if (!opts.length) continue;
      const hit =
        opts.find((o) => o.textContent.toLowerCase().includes(want)) ||
        opts.find((o) => want.includes(o.textContent.toLowerCase().trim().slice(0, 40))) ||
        opts[0];
      if (hit) {
        hit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        hit.click();
        await sleep(250);
        return true;
      }
    }
    return !!input.value?.trim();
  }

  function fillEssayFromProfile(profile, filledSet) {
    const essays = [
      [/about\s*yourself/i, 'answer_about_yourself'],
      [/why.*(leave|interested|apply|role|company|us)/i, 'answer_why_leave'],
      [/strength/i, 'answer_strengths'],
      [/weakness/i, 'answer_weaknesses'],
      [/salary|compensation|ctc/i, 'answer_salary_expectation'],
    ];
    let n = 0;
    for (const el of collectFillableElements()) {
      if (el.tagName !== 'TEXTAREA' && !el.isContentEditable) continue;
      if (!isVisible(el) || !isEmpty(el) || filledSet.has(el)) continue;
      const sig = fieldSignature(el);
      for (const [re, path] of essays) {
        if (!re.test(sig)) continue;
        const v = valueForPath(profile, path);
        if (v) {
          setNativeValue(el, v);
          filledSet.add(el);
          n++;
          log('essay:', path);
        }
        break;
      }
    }
    return n;
  }

  function queryByName(name) {
    const esc = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return document.querySelector(
      `input[name="${esc}"], textarea[name="${esc}"], select[name="${esc}"]`,
    );
  }

  function genericPrefValue(profile, kind) {
    const country = profile.location?.country || profile.work_auth_country;
    switch (kind) {
      case 'source':
        return ['linkedin', 'job board', 'company website', 'internet'];
      case 'phone_device_type':
        return ['mobile', 'cell phone', 'cell'];
      case 'country_phone_code':
        return country ? [String(country).toLowerCase(), `${String(country).toLowerCase()} (+`] : [];
      case 'work_authorization':
        return profile.authorized_to_work === false ? ['no'] : ['yes'];
      case 'sponsorship':
        return profile.require_sponsorship ? ['yes'] : ['no'];
      case 'conflict':
        return ['no'];
      case 'location_country':
        return country ? [String(country).toLowerCase()] : [];
      default:
        return [];
    }
  }

  function genericChoicePrefs(sig, profile) {
    if (isSalutationTitleSig(sig)) {
      return salutationPrefs(profile);
    }
    if (/how did you hear|hear about us|referral source|\bsource\b/.test(sig)) {
      return genericPrefValue(profile, 'source');
    }
    if (/phone device type|device type/.test(sig)) {
      return genericPrefValue(profile, 'phone_device_type');
    }
    if (/country phone code|phone code|dial code/.test(sig)) {
      return genericPrefValue(profile, 'country_phone_code');
    }
    if (/authorized.*work|legally.*work|eligible to work|right to work/.test(sig)) {
      return genericPrefValue(profile, 'work_authorization');
    }
    if (/sponsor|visa/.test(sig)) {
      return genericPrefValue(profile, 'sponsorship');
    }
    if (
      /relative|family member|conflict of interest|currently employed|previously employed|ever been employed|worked for/.test(
        sig,
      )
    ) {
      return genericPrefValue(profile, 'conflict');
    }
    if (
      /(\bcity\b|\bcountry\b|address line|^\*?location\b)/.test(sig) &&
      !/search|gllocation|global|navbar|header|searchjob|locationinput|pin.?code|postal|zip/i.test(
        sig,
      )
    ) {
      return genericPrefValue(profile, 'location_country');
    }
    return [];
  }

  const VENDOR_ATTR_MAP = [
    ['firstname', 'first_name'],
    ['givenname', 'first_name'],
    ['lastname', 'last_name'],
    ['familyname', 'last_name'],
    ['email', 'email'],
    ['phonenumber', 'phone'],
    ['mobilephone', 'phone'],
    ['phone', 'phone'],
    ['pincode', 'zip_code'],
    ['postalcode', 'zip_code'],
    ['zipcode', 'zip_code'],
    ['city', 'location.city'],
    ['addressline1', 'location.full'],
    ['linkedin', 'links.linkedin'],
    ['salutation', 'salutation'],
    ['title', 'salutation'],
  ];

  function vendorValueForAttr(attr, path, profile, el) {
    if (path === 'salutation') return salutationPrefs(profile)[0];
    const raw = valueForPath(profile, path);
    return normalizeFilledValue(el, path, raw, profile);
  }

  function normalizeVendorKey(raw) {
    return String(raw || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function resolveVendorInput(node) {
    if (!node) return null;
    if (/^(INPUT|TEXTAREA|SELECT)$/i.test(node.tagName)) return node;
    return node.querySelector(
      'input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select',
    );
  }

  function prepareInputForFill(el) {
    if (!el) return false;
    if (el.readOnly) {
      try {
        el.readOnly = false;
      } catch {
        return false;
      }
    }
    return true;
  }

  async function fillByVendorAttributes(profile, filledSet) {
    let n = 0;
    const root = applicationFormRoot();
    const nodes = root.querySelectorAll(
      '[data-ph-at-id], [data-ph-id], [data-field], [data-field-id], [data-form-field]',
    );
    for (const node of nodes) {
      const attr = normalizeVendorKey(
        node.getAttribute('data-ph-at-id') ||
          node.getAttribute('data-ph-id') ||
          node.getAttribute('data-field'),
      );
      const el = resolveVendorInput(node);
      if (!el || !isVisible(el) || filledSet.has(el) || !isEmpty(el) || isAutofillExcluded(el)) {
        continue;
      }
      for (const [key, path] of VENDOR_ATTR_MAP) {
        if (attr !== key && !attr.endsWith(key) && !attr.includes(key)) continue;
        if (key === 'phone' && /country|device|code|title|profile/i.test(attr)) continue;
        if (key === 'title' && /jobtitle|positiontitle/i.test(attr)) continue;
        const val = vendorValueForAttr(attr, path, profile, el);
        if (!val || !prepareInputForFill(el)) continue;
        if (el.tagName === 'SELECT') {
          if (!(await setGenericDropdownByPrefs(el, [val]) || setSelectValue(el, val))) continue;
          fillUi.onField(el, attr);
        } else if (
          el.getAttribute('role') === 'combobox' ||
          node.querySelector('[role="combobox"], button[aria-haspopup]')
        ) {
          const trigger =
            el.getAttribute('role') === 'combobox'
              ? el
              : node.querySelector('[role="combobox"], button[aria-haspopup="listbox"]');
          if (trigger && (await setGenericDropdownByPrefs(trigger, [val]))) {
            filledSet.add(trigger);
            filledSet.add(el);
            n++;
            fillUi.onField(trigger, attr);
            log('vendor:dd', attr, '=', val);
            break;
          }
          continue;
        } else {
          await setFieldValue(el, val, attr);
        }
        filledSet.add(el);
        n++;
        log('vendor:attr', attr, '=', String(val).slice(0, 30));
        break;
      }
    }
    return n;
  }

  async function openGenericListbox(trigger) {
    try {
      trigger.scrollIntoView({ block: 'center', behavior: 'instant' });
    } catch {
      /* ignore */
    }
    await sleep(100);
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    trigger.click?.();
    let options = [];
    for (let i = 0; i < 8; i++) {
      await sleep(160);
      options = [...document.querySelectorAll('[role="listbox"] [role="option"], [role="option"], li')]
        .filter(isVisible)
        .filter((o) => {
          const t = (o.textContent || '').replace(/\s+/g, ' ').trim();
          return t.length > 1 && !/^search results/i.test(t);
        });
      if (options.length) break;
    }
    return options;
  }

  async function setGenericDropdownByPrefs(trigger, prefs) {
    if (!trigger || !prefs?.length) return false;
    if (detectAts() === 'workday') return setWorkdayDropdownByPrefs(trigger, prefs);
    const options = await openGenericListbox(trigger);
    if (!options.length) return false;
    let hit = null;
    for (const pref of prefs) {
      hit = options.find((o) => optionMatchesPref(o.textContent, pref));
      if (hit) break;
    }
    if (!hit) return false;
    hit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    hit.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    hit.click?.();
    await sleep(200);
    return true;
  }

  async function fillGenericChoiceFields(profile, filledSet) {
    let n = 0;
    for (const el of scopedFillableElements()) {
      if (!isVisible(el) || filledSet.has(el) || !isEmpty(el)) continue;
      const sig = fieldSignature(el);
      if (!sig) continue;
      const prefs = genericChoicePrefs(sig, profile);
      if (!prefs.length) continue;
      let ok = false;
      if (el.tagName === 'SELECT') {
        for (const pref of prefs) {
          if (setSelectValue(el, pref)) {
            ok = true;
            break;
          }
        }
      } else if (el.getAttribute('role') === 'combobox') {
        ok = await fillLeverTypeahead(el, prefs[0]);
      }
        if (ok) {
          filledSet.add(el);
          n++;
          fillUi.onField(el, sig.slice(0, 44));
          log('generic:choice', prefs[0], '<=', sig.slice(0, 60));
        }
    }

    const triggers = applicationFormRoot().querySelectorAll(
      '[role="combobox"], button[aria-haspopup="listbox"], [aria-haspopup="listbox"], select',
    );
    for (const trigger of triggers) {
      if (!isVisible(trigger) || filledSet.has(trigger) || isAutofillExcluded(trigger)) continue;
      const cur = (trigger.value || trigger.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (cur && !/select|please select|choose one|^search$|^\s*$/.test(cur) && cur.length > 2) {
        continue;
      }
      const sig = fieldSignature(trigger);
      const prefs = genericChoicePrefs(sig, profile);
      if (!prefs.length) continue;
      const ok = await setGenericDropdownByPrefs(trigger, prefs);
      if (ok) {
        filledSet.add(trigger);
        n++;
        fillUi.onField(trigger, sig.slice(0, 44));
        log('generic:dropdown', prefs[0], '<=', sig.slice(0, 60));
      }
    }
    return n;
  }

  function fillGenericScreeningRadios(profile, filledSet) {
    const engine = window.HyredAutofillEngine;
    if (!engine) return 0;
    let n = 0;
    const groups = new Map();
    for (const el of scopedFillableElements().filter((e) => e.type === 'radio')) {
      if (!isVisible(el) || el.disabled) continue;
      const key = el.name || labelForControl(el.closest('fieldset, [role="radiogroup"]') || el);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(el);
    }
    for (const radios of groups.values()) {
      if (radios.some((r) => r.checked) || radios.every((r) => filledSet.has(r))) continue;
      const sig = radios.map((r) => fieldSignature(r)).join(' ');
      const prefs = genericChoicePrefs(sig, profile);
      if (!prefs.length) continue;
      const pick = engine.pickRadio(radios, 'authorized_work', prefs[0]) || engine.pickRadio(radios, 'sponsorship', prefs[0]);
      if (pick && !pick.checked) {
        pick.click();
        radios.forEach((r) => filledSet.add(r));
        n++;
        log('generic:radio', prefs[0], '<=', sig.slice(0, 60));
      }
    }
    return n;
  }

  async function fillLeverUrls(profile, filledSet) {
    if (detectAts() !== 'lever') return 0;
    const pairs = [
      ['urls[LinkedIn]', profile.links?.linkedin],
      ['urls[GitHub]', profile.links?.github],
      ['urls[Github]', profile.links?.github],
      ['urls[Portfolio]', profile.links?.portfolio],
      ['urls[Website]', profile.links?.portfolio],
      ['urls[Twitter]', profile.links?.twitter],
      ['urls[X]', profile.links?.twitter],
    ];
    let n = 0;
    for (const [name, value] of pairs) {
      if (!value) continue;
      const el = queryByName(name);
      if (!el || !isVisible(el) || !isEmpty(el) || filledSet.has(el)) continue;
      setNativeValue(el, value);
      filledSet.add(el);
      n++;
      log('lever:url', name);
    }
    document.querySelectorAll('input[name^="urls["]').forEach((el) => {
      if (!isVisible(el) || !isEmpty(el) || filledSet.has(el)) return;
      const nm = (el.name || '').toLowerCase();
      let value = null;
      if (/linkedin/.test(nm)) value = profile.links?.linkedin;
      else if (/github/.test(nm)) value = profile.links?.github;
      else if (/portfolio|website|personal/.test(nm)) value = profile.links?.portfolio;
      else if (/twitter|x\]/.test(nm)) value = profile.links?.twitter;
      if (value) {
        setNativeValue(el, value);
        filledSet.add(el);
        n++;
      }
    });
    return n;
  }

  /** Simplify-style: classify labels → profile values → fill plan. */
  async function executeFillPlan(profile, filledSet) {
    const engine = window.HyredAutofillEngine;
    if (!engine) {
      log('autofill-engine.js missing — reload extension');
      return 0;
    }
    const plan = engine.buildFillPlan({
      profile,
      labelForControl,
      fieldSignature,
      collectFillableElements: scopedFillableElements,
      isVisible,
      isEmpty,
      detectAts,
      queryByName,
    });
    let n = 0;
    for (const instr of plan) {
      const sig = instr.blockLabel || instr.el?.id || '';
      if (isWorkdayDedicatedField(sig) || isWorkdayDedicatedField(fieldSignature(instr.el))) continue;
      if (instr.kind === 'radio') {
        const pick = engine.pickRadio(instr.radios, instr.fieldId, instr.value);
        if (pick && !pick.checked && !filledSet.has(pick)) {
          pick.click();
          filledSet.add(pick);
          n++;
          log('engine:radio', instr.fieldId, '=', instr.value);
        }
        continue;
      }
      const el = instr.el;
      if (!el || !isVisible(el) || !isEmpty(el) || filledSet.has(el)) continue;
      if (instr.kind === 'typeahead') {
        if (await fillLeverTypeahead(el, instr.value)) {
          filledSet.add(el);
          n++;
          log('engine:typeahead', instr.fieldId);
        }
      } else if (el.tagName === 'SELECT') {
        if (setSelectValue(el, instr.value)) {
          filledSet.add(el);
          n++;
          log('engine:select', instr.fieldId);
        }
      } else {
        await setFieldValue(el, instr.value, instr.fieldId || instr.blockLabel?.slice(0, 40));
        filledSet.add(el);
        n++;
        log('engine:text', instr.fieldId, instr.blockLabel?.slice(0, 50));
      }
    }
    return n;
  }

  // -------------------------------------------------------------------
  // Workday adapter. Workday is React-controlled and ignores name/label
  // heuristics — fields key off data-automation-id, and dropdowns are custom
  // button→listbox widgets (not <select>). This mirrors how modern fillers
  // (Jotofiller, job_app_filler) handle Workday.
  // -------------------------------------------------------------------
  function wdLocalPhone(phone) {
    let d = String(phone || '').replace(/[^\d]/g, '').replace(/^0+/, '');
    if (d.length > 10) d = d.slice(-10); // strip country code
    return d;
  }

  // Open a Workday dropdown trigger and return its visible options.
  async function openWorkdayOptions(trigger) {
    try {
      trigger.scrollIntoView({ block: 'center', behavior: 'instant' });
    } catch {
      /* ignore */
    }
    await sleep(120);
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    trigger.click();
    const optionSel =
      'ul[role="listbox"] li[role="option"], [role="listbox"] [role="option"],' +
      '[data-automation-id="promptOption"], [data-automation-id="promptLeafNode"],' +
      '[data-automation-id="menuItem"], [data-automation-id="activeListContainer"] li,' +
      '[data-automation-id="selectGridContainer"] [role="option"], div[role="option"]';
    let options = [];
    for (let i = 0; i < 12; i++) {
      await sleep(180);
      options = [...document.querySelectorAll(optionSel)].filter((o) => {
        if (!isVisible(o)) return false;
        const t = (o.textContent || '').replace(/\s+/g, ' ').trim();
        return t.length > 1 && !/^search results/i.test(t);
      });
      if (options.length) break;
    }
    return options;
  }

  function optionMatchesPref(optText, pref) {
    const t = String(optText || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    const p = String(pref || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    if (!t || !p) return false;
    if (t === p) return true;
    if (p.length >= 3 && t.includes(p)) return true;
    if (p === 'no' && (t === 'no' || t.startsWith('no '))) return true;
    if (p === 'yes' && (t === 'yes' || t.startsWith('yes '))) return true;
    return false;
  }

  // Open a Workday dropdown and click the option matching `value`.
  async function setWorkdayDropdown(trigger, value) {
    if (!trigger || value == null || String(value).trim() === '') return false;
    const want = String(value).toLowerCase().trim();
    const options = await openWorkdayOptions(trigger);
    if (!options.length) return false;
    const text = (o) => (o.textContent || '').toLowerCase().trim();
    const hit =
      options.find((o) => text(o) === want) ||
      options.find((o) => text(o).includes(want)) ||
      options.find((o) => want.includes(text(o)) && text(o).length > 1);
    if (!hit) {
      trigger.click(); // close
      return false;
    }
    hit.click();
    await sleep(220);
    return true;
  }

  // Pick only from prefs — never fall back to the first list option (avoids
  // selecting North Korea etc. when the intended answer is "Does Not Apply").
  async function setWorkdayDropdownStrict(trigger, prefs) {
    if (!trigger || !prefs?.length) return false;
    const options = await openWorkdayOptions(trigger);
    if (!options.length) return false;
    let hit = null;
    for (const p of prefs) {
      hit = options.find((o) => optionMatchesPref(o.textContent, p));
      if (hit) break;
    }
    if (!hit) {
      trigger.click();
      return false;
    }
    try {
      hit.scrollIntoView({ block: 'center' });
    } catch {
      /* ignore */
    }
    hit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    hit.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    hit.click();
    await sleep(220);
    return true;
  }

  // Open a Workday dropdown and pick the first option matching the preference
  // list (in order); fall back to the first real (non-placeholder) option so a
  // required dropdown never blocks the user. Used for "How did you hear about
  // us" where we have no exact profile value.
  async function setWorkdayDropdownByPrefs(trigger, prefs) {
    if (!trigger) return false;
    const options = await openWorkdayOptions(trigger);
    if (!options.length) return false;
    const text = (o) => (o.textContent || '').toLowerCase().trim();
    let hit = null;
    for (const p of prefs) {
      hit = options.find((o) => text(o).includes(p));
      if (hit) break;
    }
    if (!hit) {
      hit = options.find(
        (o) => text(o).length > 1 && !/select one|search|^choose/.test(text(o)),
      );
    }
    if (!hit) {
      trigger.click();
      return false;
    }
    hit.click();
    await sleep(220);
    return true;
  }

  function wdDropdownTrigger(idParts) {
    const sels = [
      'button[data-automation-id]',
      '[data-automation-id] button',
      'div[data-automation-id][aria-haspopup="listbox"]',
      'button[aria-haspopup="listbox"]',
      '[role="combobox"]',
    ];
    const nodes = [...document.querySelectorAll(sels.join(','))];
    for (const node of nodes) {
      const own = (node.getAttribute('data-automation-id') || '').toLowerCase();
      const parent =
        node.closest('[data-automation-id]')?.getAttribute('data-automation-id')?.toLowerCase() || '';
      const label = labelForControl(node).toLowerCase();
      const hay = `${own} ${parent} ${label}`;
      if (idParts.some((p) => hay.includes(p)) && isVisible(node)) return node;
    }
    return null;
  }

  // Type into a Workday input WITHOUT firing blur (blur closes the prompt
  // before we can click an option). Dispatches the event sequence Workday's
  // React multiselect listens to.
  function typeWorkday(input, term) {
    try {
      input.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
    const desc = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    );
    if (desc?.set) desc.set.call(input, term);
    else input.value = term;
    const key = term.slice(-1) || 'a';
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: term }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key }));
  }

  function wdAncestorAids(el) {
    const aids = [];
    let n = el;
    for (let i = 0; i < 8 && n; i++, n = n.parentElement) {
      const aid = n.getAttribute?.('data-automation-id');
      if (aid) aids.push(aid.toLowerCase());
    }
    return aids.join(' ');
  }

  function workdayMsFieldRoot(input) {
    return (
      input.closest('[data-automation-id^="formField"]') ||
      input.closest('[data-automation-id*="multiSelect" i]') ||
      input.parentElement
    );
  }

  function workdayMultiSelectFilled(container, input) {
    const root = workdayMsFieldRoot(input) || container;
    for (const chip of root?.querySelectorAll(
      '[data-automation-id="selectedItem"]',
    ) || []) {
      const t = (chip.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.length > 1 && !/^search$/i.test(t)) return true;
    }
    // Typed filter text alone is NOT a committed value.
    return false;
  }

  function pressWorkdayKey(input, key) {
    for (const type of ['keydown', 'keypress', 'keyup']) {
      input.dispatchEvent(
        new KeyboardEvent(type, { bubbles: true, cancelable: true, key, code: key }),
      );
    }
  }

  function skillToken(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function optionMatchesSkill(option, skill) {
    const want = skillToken(skill);
    const t = skillToken(option?.textContent);
    if (!want || !t) return false;
    if (t === want) return true;
    if (t.includes(want) && want.length >= 3) return true;
    if (want.includes(t) && t.length >= 4) return true;
    return false;
  }

  function pickSkillOption(opts, skill) {
    const want = skillToken(skill);
    if (!want) return null;
    let best = null;
    let bestScore = 0;
    for (const o of opts) {
      if (!optionMatchesSkill(o, skill)) continue;
      const t = skillToken(o.textContent);
      if (t === want) return o;
      const score = Math.min(t.length, want.length);
      if (score > bestScore) {
        bestScore = score;
        best = o;
      }
    }
    return best;
  }

  function dedupeOptionsByText(opts) {
    const seen = new Set();
    const out = [];
    for (const o of opts) {
      const t = skillToken(o.textContent);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(o);
    }
    return out;
  }

  // Type char-by-char so Workday's skills typeahead receives incremental input events.
  async function typeWorkdayIncremental(input, term) {
    typeWorkday(input, '');
    await sleep(60);
    let acc = '';
    for (const ch of String(term)) {
      acc += ch;
      typeWorkday(input, acc);
      await sleep(45);
    }
  }

  function allSkillOptions() {
    const seen = new Set();
    const out = [];
    for (const o of [...msOptions(), ...msOptionsForInput()]) {
      if (!o || seen.has(o)) continue;
      seen.add(o);
      out.push(o);
    }
    return dedupeOptionsByText(out);
  }

  async function waitSkillOptionsAfterSearch(skill) {
    for (let i = 0; i < 12; i++) {
      await sleep(200);
      const opts = allSkillOptions();
      if (!opts.length) continue;
      if (opts.length === 1 && /no items/i.test(opts[0].textContent || '')) {
        return { opts, hit: null };
      }
      const hit = pickSkillOption(opts, skill) || pickMsOption(opts, [skill], false);
      if (hit) return { opts, hit };
    }
    const opts = allSkillOptions();
    const hit = pickSkillOption(opts, skill) || pickMsOption(opts, [skill], false);
    return { opts, hit };
  }

  function skillChipLabels(root) {
    const labels = new Set();
    for (const el of root?.querySelectorAll('[data-automation-id="selectedItem"]') || []) {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.length > 1 && !/^search$/i.test(t)) labels.add(t.toLowerCase());
    }
    return labels;
  }

  function chipMatchesSkill(chipLabel, skill) {
    const a = skillToken(chipLabel);
    const b = skillToken(skill);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.includes(b) && b.length >= 3) return true;
    if (b.includes(a) && a.length >= 4) return true;
    return false;
  }

  // Options scoped to the open Workday prompt popup (not the whole-page taxonomy).
  function msOptionsForInput() {
    const containers = [
      ...document.querySelectorAll('[data-automation-id="activeListContainer"]'),
      ...document.querySelectorAll('[data-automation-id="wd-ActiveList"]'),
      ...document.querySelectorAll('[role="listbox"]'),
    ].filter(isVisible);
    const out = [];
    const seen = new Set();
    for (const c of containers) {
      for (const el of c.querySelectorAll(
        '[data-automation-id="promptLeafNode"], [data-automation-id="promptOption"], li[role="option"], [role="option"]',
      )) {
        if (!el || seen.has(el) || !isVisible(el)) continue;
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t.length < 2 || /^search results/i.test(t)) continue;
        seen.add(el);
        out.push(el);
      }
    }
    return out;
  }

  async function commitWorkdaySkillOne(input, skill, root, opts = {}) {
    const sk = String(skill).trim();
    if (!sk) return false;
    const beforeLabels = skillChipLabels(root);
    if ([...beforeLabels].some((c) => chipMatchesSkill(c, sk))) return true;

    if (!opts.reusePrompt) {
      await openWorkdayPrompt(input);
    } else if (!opts.promptOpen) {
      await openWorkdayPrompt(input);
      opts.promptOpen = true;
    }

    // Simplify-style defaultWithoutBlur: set full value at once (not char-by-char).
    typeWorkday(input, '');
    await sleep(opts.fast ? 50 : 80);
    typeWorkday(input, sk);
    await sleep(opts.fast ? 140 : 200);
    pressWorkdayEnter(input);
    await sleep(opts.fast ? 200 : 300);

    const { opts: listOpts, hit } = await waitSkillOptionsAfterSearch(sk);
    log(
      'workday:skill',
      sk,
      'opts=',
      listOpts.length,
      hit ? `hit=${(hit.textContent || '').trim().slice(0, 32)}` : 'no hit',
    );

    if (!hit) {
      log('workday:skill', sk, 'failed — no match after type+Enter');
      typeWorkday(input, '');
      return false;
    }

    await confirmMsOption(input, hit, root);
    typeWorkday(input, '');
    await sleep(opts.fast ? 80 : 150);

    const afterLabels = skillChipLabels(root);
    const ok = [...afterLabels]
      .filter((l) => !beforeLabels.has(l))
      .some((l) => chipMatchesSkill(l, sk));
    log(
      'workday:skill',
      sk,
      ok ? 'committed' : 'failed',
      'chips',
      beforeLabels.size,
      '->',
      afterLabels.size,
    );
    return ok;
  }

  async function addWorkdaySkill(input, skill) {
    const root = workdayMsFieldRoot(input);
    try {
      input.scrollIntoView({ block: 'center', behavior: 'instant' });
    } catch {
      /* ignore */
    }
    return commitWorkdaySkillOne(input, skill, root, { reusePrompt: false });
  }

  /** Simplify-style: open prompt once, pass skills[] with instant value set per item. */
  async function addWorkdaySkillsBatch(input, skills) {
    const root = workdayMsFieldRoot(input);
    const pending = (skills || [])
      .map((s) => String(s).trim())
      .filter(Boolean)
      .filter(
        (sk) => ![...skillChipLabels(root)].some((c) => chipMatchesSkill(c, sk)),
      )
      .slice(0, 20);
    if (!pending.length) return 0;

    try {
      input.scrollIntoView({ block: 'center', behavior: 'instant' });
    } catch {
      /* ignore */
    }

    log('workday:skills batch', pending.length, 'keywords');
    const state = { reusePrompt: true, promptOpen: false, fast: true };
    let n = 0;
    for (let i = 0; i < pending.length; i++) {
      const sk = pending[i];
      if (await commitWorkdaySkillOne(input, sk, root, state)) n++;
      if (IS_TOP_FRAME && fillUi.active) {
        fillUi.setPhase(`Skills ${i + 1}/${pending.length}…`);
      }
      await sleep(100);
    }
    log('workday:skills batch done', n, '/', pending.length);
    return n;
  }

  function pickMsOption(opts, cands, preferExact) {
    const norm = (o) => (o.textContent || '').replace(/\s+/g, ' ').trim();
    const normLc = (o) => norm(o).toLowerCase();
    if (preferExact) {
      const exact = opts.find((o) => /^linkedin$/i.test(norm(o)));
      if (exact) return exact;
      const linked = opts
        .filter((o) => /^linkedin/i.test(norm(o)))
        .sort((a, b) => norm(a).length - norm(b).length);
      if (linked.length) return linked[0];
    }
    for (const c of cands) {
      const lc = String(c).toLowerCase().trim();
      if (!lc) continue;
      const hit =
        opts.find((o) => normLc(o) === lc) ||
        opts.find((o) => normLc(o).includes(lc));
      if (hit) return hit;
    }
    return null;
  }

  async function confirmMsOption(input, option, root) {
    const clickables = [
      option.querySelector('[data-automation-id="promptLeafNode"]'),
      option.querySelector('[data-automation-id="promptOption"]'),
      option.querySelector('[role="option"]'),
      option,
    ].filter(Boolean);
    for (const el of clickables) {
      try {
        el.scrollIntoView({ block: 'center' });
      } catch {
        /* ignore */
      }
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.click();
      await sleep(280);
      if (workdayMultiSelectFilled(root, input)) return true;
    }
    pressWorkdayKey(input, 'ArrowDown');
    await sleep(120);
    pressWorkdayEnter(input);
    await sleep(320);
    if (workdayMultiSelectFilled(root, input)) return true;
    pressWorkdayEnter(input);
    await sleep(320);
    return workdayMultiSelectFilled(root, input);
  }

  function findWorkdayPromptIcon(input) {
    const roots = [
      input.closest('[data-automation-id^="formField"]'),
      input.closest('[data-automation-id*="multiSelect" i]'),
      input.parentElement,
      input.parentElement?.parentElement,
    ].filter(Boolean);
    for (const root of roots) {
      const icon = root.querySelector('[data-automation-id="promptIcon"]');
      if (icon) return icon;
    }
    return null;
  }

  const MS_OPT_SEL =
    '[data-automation-id="activeListContainer"] [role="option"],' +
    '[data-automation-id="activeListContainer"] li,' +
    'ul[role="listbox"] li[role="option"], [role="listbox"] [role="option"],' +
    '[data-automation-id="promptOption"], [data-automation-id="menuItem"],' +
    'div[data-automation-id="promptLeafNode"], li[data-automation-id="promptOption"]';

  function msOptions() {
    return [...document.querySelectorAll(MS_OPT_SEL)].filter((o) => {
      if (!isVisible(o)) return false;
      const t = (o.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.length < 2) return false;
      if (/^search results\s*\(/i.test(t)) return false;
      return true;
    });
  }

  async function waitMsOptions() {
    let opts = [];
    for (let i = 0; i < 10; i++) {
      await sleep(150);
      opts = msOptions();
      if (opts.length) break;
    }
    return opts;
  }

  // Open a Workday prompt: scroll into view, click the promptIcon (☰) first —
  // Workday prompts do NOT open reliably from the text input alone.
  async function openWorkdayPrompt(input) {
    const icon = findWorkdayPromptIcon(input);
    const targets = [icon, input].filter(Boolean);
    for (const el of targets) {
      try {
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
      } catch {
        try {
          el.scrollIntoView();
        } catch {
          /* ignore */
        }
      }
      await sleep(180);
      try {
        el.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.click();
      await sleep(220);
      if (msOptions().length) return true;
    }
    return false;
  }

  function pressWorkdayEnter(input) {
    for (const type of ['keydown', 'keypress', 'keyup']) {
      input.dispatchEvent(
        new KeyboardEvent(type, {
          bubbles: true,
          cancelable: true,
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
        }),
      );
    }
  }

  // Workday multiSelect / prompt: scroll+click promptIcon, type to filter,
  // click matching option (or Enter). Returns true only when a value chip appears.
  async function setWorkdayMultiSelect(input, candidates, fallbackFirst, preferExact) {
    const root = workdayMsFieldRoot(input);
    const t = (o) => (o.textContent || '').toLowerCase().trim();

    const opened = await openWorkdayPrompt(input);
    let options = await waitMsOptions();
    log('workday:ms open opened=', opened, 'optionsFound=', options.length);

    let hit = pickMsOption(options, candidates, preferExact);

    for (const c of candidates) {
      if (hit) break;
      if (!c) continue;
      typeWorkday(input, String(c));
      await sleep(250);
      options = await waitMsOptions();
      hit = pickMsOption(options, [c], preferExact);
      log('workday:ms type', String(c), 'optionsFound=', options.length);
      if (hit) break;
      pressWorkdayKey(input, 'ArrowDown');
      await sleep(120);
      pressWorkdayEnter(input);
      await sleep(280);
      if (workdayMultiSelectFilled(root, input)) {
        log('workday:ms confirmed via Enter after type', c);
        return true;
      }
      typeWorkday(input, '');
      await sleep(120);
    }

    if (!hit && fallbackFirst) {
      await openWorkdayPrompt(input);
      options = await waitMsOptions();
      hit = options.find((o) => {
        const tx = t(o);
        return tx.length > 1 && !/select one|^search$|^choose|search results/.test(tx);
      });
    }

    if (!hit) {
      log('workday:ms no option matched for', candidates[0]);
      return false;
    }
    const ok = await confirmMsOption(input, hit, root);
    log('workday:ms confirm', ok ? 'ok' : 'failed', '→', (hit.textContent || '').trim().slice(0, 40));
    return ok;
  }

  // Workday puts data-automation-id="multiselectInputContainer" on a WRAPPER
  // div; the actual <input> has no automation-id. Querying
  // input[data-automation-id="multiselectInputContainer"] always returns 0.
  function findWorkdayMultiSelectInputs() {
    const out = [];
    const seen = new Set();
    const add = (input) => {
      if (!input || seen.has(input) || input.type === 'hidden' || input.type === 'file')
        return;
      seen.add(input);
      out.push(input);
    };

    for (const wrap of document.querySelectorAll(
      '[data-automation-id="multiselectInputContainer"]',
    )) {
      const inp =
        wrap.tagName === 'INPUT'
          ? wrap
          : wrap.querySelector('input[type="text"], input:not([type])');
      if (inp) add(inp);
    }

    for (const field of document.querySelectorAll(
      '[data-automation-id*="source--source" i], [data-automation-id*="countryPhoneCode" i], [data-automation-id*="countryphonecode" i]',
    )) {
      const inp = field.querySelector('input[type="text"], input:not([type])');
      if (inp) add(inp);
    }

    for (const box of document.querySelectorAll('[data-automation-id="searchBox"]')) {
      const inp =
        box.tagName === 'INPUT'
          ? box
          : box.querySelector('input[type="text"], input:not([type])');
      if (inp) add(inp);
    }

    return out.filter((el) => {
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) return true;
      const wrap = el.closest(
        '[data-automation-id="multiselectInputContainer"], [data-automation-id^="formField"]',
      );
      if (wrap) {
        const wr = wrap.getBoundingClientRect();
        return wr.width > 0 && wr.height > 0;
      }
      return isVisible(el);
    });
  }

  function isWorkdayExperienceStep() {
    if (!isWorkdaySite()) return false;
    if (document.querySelector('input[data-automation-id="file-upload-input-ref"]'))
      return true;
    if (document.querySelector('[data-automation-id*="skills" i]')) return true;
    const hay = document.body.innerText.slice(0, 10000).toLowerCase();
    return (
      /my experience/.test(hay) &&
      (/type to add skills|resume\s*\/\s*cv|social network|upload a file/i.test(hay) ||
        /websites/.test(hay))
    );
  }

  function findWorkdayLanguageRows() {
    const roots = new Set();
    for (const block of document.querySelectorAll(
      '[data-automation-id^="languages-"], [data-automation-id^="language-"]',
    )) {
      const aid = block.getAttribute('data-automation-id') || '';
      if (/^languages?-\d+$/i.test(aid)) roots.add(block);
    }
    if (!roots.size) {
      for (const h of document.querySelectorAll('h2, h3, h4, legend, [data-automation-id="richText"]')) {
        const t = (h.textContent || '').replace(/\s+/g, ' ').trim();
        if (!/^languages?\s+\d+/i.test(t)) continue;
        const container =
          h.closest('[data-automation-id^="languages-"]') ||
          h.closest('[data-automation-id^="language-"]') ||
          h.closest('[role="group"]') ||
          h.parentElement?.parentElement;
        if (container) roots.add(container);
      }
    }
    if (!roots.size) {
      for (const field of document.querySelectorAll('[data-automation-id^="formField"]')) {
        const label = workdayFieldLabel(field).toLowerCase().trim();
        if (!/^language\s*\*?$/.test(label)) continue;
        let node = field;
        for (let d = 0; d < 10 && node; d++) {
          const text = (node.textContent || '').toLowerCase();
          if (/comprehension/.test(text) && /speaking/.test(text) && /reading/.test(text)) {
            roots.add(node);
            break;
          }
          node = node.parentElement;
        }
      }
    }
    const sorted = [...roots].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return sorted.filter((a, i) => {
      for (let j = 0; j < sorted.length; j++) {
        if (i !== j && a.contains(sorted[j]) && a !== sorted[j]) return false;
      }
      return true;
    });
  }

  async function clickWorkdayLanguagesAdd() {
    let btn =
      findWorkdaySectionAddButton(/^languages$/i) ||
      findWorkdaySectionAddButton(/^language$/i) ||
      findWorkdaySectionAddButton(/languages/i);

    if (!btn) {
      const langHeading = [...document.querySelectorAll('h2, h3, h4, legend')].find((h) =>
        /languages/i.test(h.textContent || ''),
      );
      if (langHeading) {
        const allAdd = [...document.querySelectorAll(
          '[data-automation-id="add-button"], button, [role="button"]',
        )].filter((b) => isVisible(b) && isWorkdayAddButton(b));
        const y = langHeading.getBoundingClientRect().top;
        const near = allAdd.filter((b) => {
          const by = b.getBoundingClientRect().top;
          return by >= y - 30 && by < y + 500;
        });
        if (near.length) btn = near[near.length - 1];
      }
    }

    if (!btn) {
      log('workday:languages add button not found');
      return false;
    }
    log('workday:languages clicking', workdayAddButtonLabel(btn) || btn.getAttribute('data-automation-id'));
    await workdayClick(btn);
    await sleep(1000);
    return true;
  }

  const WORKDAY_FLUENT_LEVEL_PREFS = [
    '4 - fluent',
    'fluent',
    '4 fluent',
    'native',
    'full professional',
    'professional working',
    'expert',
    'advanced',
    '5',
    '4',
  ];

  function workdayLanguageDropdownTrigger(field) {
    return field.querySelector(
      'button[aria-haspopup="listbox"], [role="combobox"], button[data-automation-id], [data-automation-id][aria-haspopup="listbox"]',
    );
  }

  function workdayDropdownNeedsFill(trigger) {
    if (!trigger || !isVisible(trigger)) return false;
    const t = (trigger.textContent || '').toLowerCase().trim();
    return !t || /select one|search|^choose|^\s*$/.test(t);
  }

  async function fillWorkdayLanguageRow(scope, langName, filledSet) {
    let n = 0;
    const langPrefs = [
      langName.toLowerCase(),
      langName.split(/\s+/)[0].toLowerCase(),
      langName.slice(0, 3).toLowerCase(),
    ].filter(Boolean);

    const fields = scope.matches('[data-automation-id^="formField"]')
      ? [scope]
      : [...scope.querySelectorAll('[data-automation-id^="formField"]')];

    for (const field of fields) {
      const label = workdayFieldLabel(field).toLowerCase().trim();
      const aid = (field.getAttribute('data-automation-id') || '').toLowerCase();

      if (
        /^language\s*\*?$/.test(label) ||
        (aid.includes('language') && !/programming|technical/.test(label))
      ) {
        const trigger = workdayLanguageDropdownTrigger(field);
        if (trigger && workdayDropdownNeedsFill(trigger) && !filledSet.has(trigger)) {
          const ok = await setWorkdayDropdownByPrefs(trigger, langPrefs);
          if (ok) {
            filledSet.add(trigger);
            n++;
            log('workday:language name', langName);
          }
        }
        continue;
      }

      if (/fluent in this language|native speaker|i am fluent/i.test(label)) {
        const cb = field.querySelector('input[type="checkbox"]');
        if (cb && !cb.checked && !filledSet.has(cb)) {
          cb.click();
          filledSet.add(cb);
          n++;
          log('workday:language fluent checkbox', langName);
        }
        continue;
      }

      if (/^(comprehension|overall|reading|speaking|writing)\s*\*?$/.test(label)) {
        const trigger = workdayLanguageDropdownTrigger(field);
        if (trigger && workdayDropdownNeedsFill(trigger) && !filledSet.has(trigger)) {
          const ok = await setWorkdayDropdownStrict(trigger, WORKDAY_FLUENT_LEVEL_PREFS);
          if (ok) {
            filledSet.add(trigger);
            n++;
            log('workday:language', label, 'fluent');
          }
        }
      }
    }
    return n;
  }

  async function fillWorkdayLanguagesMultiselect(profile, filledSet) {
    const langs = (profile.languages || ['English', 'Hindi'])
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 8);
    if (!langs.length) return 0;
    const inputs = findWorkdayMultiSelectInputs().filter((inp) => {
      const sig = `${wdAncestorAids(inp)} ${labelForControl(inp)}`.toLowerCase();
      return (
        /\blanguages?\b/i.test(sig) &&
        !/programming|technical skill|field of study|skill/i.test(sig)
      );
    });
    if (!inputs.length) return 0;
    let n = 0;
    for (const input of inputs) {
      if (filledSet.has(input) || workdayMultiSelectFilled(workdayMsFieldRoot(input), input)) continue;
      const ok = await setWorkdayMultiSelect(input, langs, false);
      if (ok) {
        filledSet.add(input);
        n++;
        log('workday:languages multiselect', langs.join(', '));
      }
    }
    return n;
  }

  async function fillWorkdayLanguages(profile, filledSet) {
    const langs = (profile.languages || ['English', 'Hindi'])
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 6);
    if (!langs.length) return 0;

    let rows = findWorkdayLanguageRows();
    if (rows.length) {
      log('workday:languages panel rows found', rows.length);
      let n = 0;
      for (let i = 0; i < langs.length; i++) {
        while (rows.length <= i) {
          const added = await clickWorkdayLanguagesAdd();
          if (!added) break;
          await sleep(700);
          rows = findWorkdayLanguageRows();
          if (rows.length <= i) break;
        }
        const row = findWorkdayLanguageRows()[i];
        if (!row) break;
        n += await fillWorkdayLanguageRow(row, langs[i], filledSet);
        log('workday:languages row', i + 1, langs[i]);
      }
      if (n) return n;
    }

    log('workday:languages no panel — trying multiselect fallback');
    return fillWorkdayLanguagesMultiselect(profile, filledSet);
  }

  async function fillWorkdaySkills(profile, filledSet, match) {
    const fromProfile = (profile.skills || []).filter(Boolean);
    const fromMatch = (match?.missing_skills || []).filter(Boolean);
    const skills = [...new Set([...fromProfile, ...fromMatch].map((s) => String(s).trim()).filter(Boolean))].slice(
      0,
      20,
    );
    if (!skills.length) return 0;
    const inputs = findWorkdayMultiSelectInputs().filter((inp) =>
      /skill|type to add/i.test(
        `${wdAncestorAids(inp)} ${labelForControl(inp)}`.toLowerCase(),
      ),
    );
    if (!inputs.length) {
      log('workday:skills no input found');
      return 0;
    }
    const input = inputs[0];
    if (IS_TOP_FRAME && fillUi.active) fillUi.setPhase(`Adding ${skills.length} skills…`);
    const n = await addWorkdaySkillsBatch(input, skills);
    if (n && !filledSet.has(input)) filledSet.add(input);
    return n;
  }

  async function fillWorkdayTypeahead(input, value, tag, filledSet) {
    if (!input || !value || !isVisible(input) || !isEmpty(input) || filledSet.has(input)) return false;

    const hasPrompt = !!findWorkdayPromptIcon(input);
    for (const term of typeaheadSearchTerms(value)) {
      if (hasPrompt) {
        await openWorkdayPrompt(input);
        await typeWorkdayIncremental(input, term);
        await sleep(200);
        pressWorkdayEnter(input);
        await sleep(900);
        const opts = msOptions().filter((o) => !/no matches found/i.test(o.textContent || ''));
        const tl = term.toLowerCase();
        const hit =
          opts.find((o) => (o.textContent || '').toLowerCase().includes(tl.slice(0, Math.min(tl.length, 14)))) ||
          opts[0];
        if (hit) {
          hit.click();
          await sleep(300);
        }
      } else {
        await setFieldValue(input, term, tag);
      }
      const cur = (input.value || '').trim();
      if (cur && !/no matches found/i.test(cur)) {
        filledSet.add(input);
        log('workday:typeahead', tag, '=', term.slice(0, 40));
        return true;
      }
      typeWorkday(input, '');
      await sleep(150);
    }
    log('workday:typeahead failed', tag, String(value).slice(0, 40));
    return false;
  }

  function findWorkdayExperienceRows() {
    const roots = new Set();
    for (const inp of document.querySelectorAll(
      'input[data-automation-id="jobTitle"], input[name="jobTitle"], input[id*="jobTitle" i]',
    )) {
      if (!isVisible(inp)) continue;
      const scope = workdayExperienceRowScope(
        inp.closest('[data-automation-id^="workExperience-"]') ||
          inp.closest('[role="group"]') ||
          inp.closest('[data-automation-id^="formField"]') ||
          inp.parentElement,
      );
      if (scope) roots.add(scope);
    }
    if (!roots.size) {
      for (const block of document.querySelectorAll('[data-automation-id^="workExperience-"]')) {
        const aid = block.getAttribute('data-automation-id') || '';
        if (!/^workExperience-\d+$/i.test(aid)) continue;
        if (
          block.querySelector(
            'input[id*="jobTitle" i], input[data-automation-id="jobTitle"], input[id*="company" i], input[data-automation-id="company"]',
          )
        ) {
          roots.add(block);
        }
      }
    }
    return [...roots];
  }

  async function clickWorkdayExperienceAdd() {
    let btn =
      findWorkdaySectionAddButton(/^work experience$/i) ||
      findWorkdaySectionAddButton(/work experience/i);

    const section = document.querySelector('[data-automation-id="workExperienceSection"]');
    if (!btn && section) {
      const inSection = [...section.querySelectorAll(
        'button, [role="button"], [data-automation-id="add-button"], [data-automation-id*="add-button" i]',
      )].filter((b) => isWorkdayClickable(b) && isWorkdayAddButton(b));
      if (inSection.length) btn = inSection[inSection.length - 1];
    }

    if (!btn) {
      const candidates = [...document.querySelectorAll(
        'button, [role="button"], [data-automation-id="add-button"], [data-automation-id*="add-button" i]',
      )].filter((b) => {
        if (!isWorkdayClickable(b) || !isWorkdayAddButton(b)) return false;
        const aids = wdAncestorAids(b);
        if (isNonExperienceAddSection(aids)) return false;
        return (
          /workexperience|work experience/i.test(aids) ||
          !!b.closest('[data-automation-id*="workExperience" i]')
        );
      });
      if (candidates.length) btn = candidates[candidates.length - 1];
    }

    if (!btn) {
      const expHeading = [...document.querySelectorAll('h2, h3, h4')].find((h) =>
        /work experience/i.test(h.textContent || ''),
      );
      const eduHeading = [...document.querySelectorAll('h2, h3, h4')].find((h) =>
        /^education$/i.test((h.textContent || '').trim()),
      );
      if (expHeading) {
        const allAdd = [...document.querySelectorAll('[data-automation-id="add-button"], button')].filter(
          (b) => isVisible(b) && isWorkdayAddButton(b),
        );
        const expY = expHeading.getBoundingClientRect().top;
        const eduY = eduHeading?.getBoundingClientRect().top ?? Infinity;
        const between = allAdd.filter((b) => {
          const y = b.getBoundingClientRect().top;
          return y >= expY - 20 && y < eduY;
        });
        if (between.length) btn = between[0];
      }
    }

    if (!btn) {
      log('workday:experience add button not found');
      return false;
    }
    log('workday:experience clicking', workdayAddButtonLabel(btn) || btn.getAttribute('data-automation-id'));
    await workdayClick(btn);
    await sleep(1200);
    return true;
  }

  async function fillWorkdayWorkExperienceRow(row, job, profile, filledSet, jobIndex = 0) {
    let n = 0;
    const scope = workdayExperienceRowScope(row);
    const q = (sels) => {
      for (const sel of sels) {
        try {
          const el = scope.querySelector(sel);
          if (el && isVisible(el)) return el;
        } catch {
          /* invalid selector */
        }
      }
      return null;
    };

    const pairs = [
      ['title', job.title, ['input[data-automation-id="jobTitle"]', 'input[name="jobTitle"]', 'input[id*="jobTitle" i]']],
      ['company', job.company, ['input[data-automation-id="company"]', 'input[name="companyName"]', 'input[id*="company" i]']],
      [
        'location',
        jobLocationFromEntry(job),
        ['input[data-automation-id="location"]', 'input[name="location"]', 'input[id*="location" i]'],
      ],
      [
        'description',
        job.summary,
        ['textarea[data-automation-id="description"]', 'textarea[id*="roleDescription" i]', 'textarea[name="description"]'],
      ],
    ];

    for (const [id, val, sels] of pairs) {
      if (!val) continue;
      const el = q(sels);
      if (!el || !isEmpty(el) || filledSet.has(el)) continue;
      if (!shouldAcceptValue(el, id, val)) continue;
      await setFieldValue(el, val, `work.${id}`);
      filledSet.add(el);
      n++;
    }

    const start = parseJobDateParts(job.start);
    const end = parseJobDateParts(job.end);
    const present = end.present || /present|current|now/i.test(String(job.end || ''));
    const startMonth = start.month || (start.year ? '01' : null);
    const endMonth = end.month || (end.year && !present ? '12' : null);

    const startMonthEl = q([
      'input[id*="startDate" i][aria-label*="Month" i]',
      'input[id*="startDate" i][data-automation-id="dateSectionMonth-input"]',
      '[data-automation-id*="startDate" i] input[aria-label*="Month" i]',
    ]);
    const startYearEl = q([
      'input[id*="startDate" i][data-automation-id="dateSectionYear-input"]',
      'input[id*="startDate" i][aria-label*="Year" i]',
      '[data-automation-id*="startDate" i] input[data-automation-id="dateSectionYear-input"]',
    ]);
    const endMonthEl = q([
      'input[id*="endDate" i][aria-label*="Month" i]',
      'input[id*="endDate" i][data-automation-id="dateSectionMonth-input"]',
      '[data-automation-id*="endDate" i] input[aria-label*="Month" i]',
    ]);
    const endYearEl = q([
      'input[id*="endDate" i][data-automation-id="dateSectionYear-input"]',
      'input[id*="endDate" i][aria-label*="Year" i]',
      '[data-automation-id*="endDate" i] input[data-automation-id="dateSectionYear-input"]',
    ]);

    for (const el of [startMonthEl, startYearEl, endMonthEl, endYearEl]) {
      if (el) await clearInvalidWorkdayDateEl(el);
    }

    const fillDate = async (el, val, tag) => {
      if (!el || !val || filledSet.has(el)) return false;
      if (!isEmpty(el) && !/mm|yyyy|invalid/i.test(el.value || '')) return false;
      await setWorkdayDatePart(el, val);
      filledSet.add(el);
      log('workday:experience', tag, val);
      return true;
    };

    if (await fillDate(startMonthEl, startMonth, 'start_month')) n++;
    if (await fillDate(startYearEl, start.year, 'start_year')) n++;
    if (!present) {
      if (await fillDate(endMonthEl, endMonth, 'end_month')) n++;
      if (await fillDate(endYearEl, end.year, 'end_year')) n++;
    }

    const isCurrentRole =
      jobIndex === 0 &&
      (end.present || /present|current|now/i.test(String(job.end || '')));

    const cb =
      scope.querySelector('input[data-automation-id="currentlyWorkHere"]') ||
      scope.querySelector('input[name="currentlyWorkHere"]');
    if (cb && !filledSet.has(cb)) {
      if (isCurrentRole && !cb.checked) {
        cb.click();
        n++;
        log('workday:experience currentlyWorkHere checked row', jobIndex + 1);
      } else if (!isCurrentRole && cb.checked) {
        cb.click();
        n++;
        log('workday:experience currentlyWorkHere unchecked row', jobIndex + 1);
      }
      filledSet.add(cb);
    }
    return n;
  }

  async function fillWorkdayWorkExperience(profile, filledSet) {
    if (!isWorkdayExperienceStep()) return 0;
    if (shouldSkipWorkExperience(profile)) {
      const ps = profile.profile_structure;
      log(
        'workday:experience skipped — profile readiness=',
        ps?.readiness,
        'work=',
        profile.work_history?.length ?? 0,
      );
      return 0;
    }
    const jobs = (profile.work_history || []).filter(isAutofillableWorkJob).slice(0, 6);
    const rawCount = profile.work_history?.length ?? 0;
    if (rawCount > jobs.length) {
      log(
        'workday:experience filtered',
        rawCount - jobs.length,
        'invalid jobs — refresh Profile from resume (AI only)',
      );
    }
    if (!jobs.length) {
      log('workday:experience no work_history in profile');
      if (IS_TOP_FRAME) {
        toast(
          'No work history. Extension → Profile → Refresh from resume, then Mark as reviewed.',
          'warn',
          9000,
        );
      }
      return 0;
    }
    log('workday:experience filling', jobs.length, 'jobs');

    let n = 0;
    for (let i = 0; i < jobs.length; i++) {
      let rows = findWorkdayExperienceRows();
      while (rows.length <= i) {
        const added = await clickWorkdayExperienceAdd();
        if (!added) {
          log('workday:experience add button not found at row', i);
          break;
        }
        await sleep(600);
        rows = findWorkdayExperienceRows();
        if (rows.length <= i) {
          log('workday:experience row did not appear after add', i, 'rows=', rows.length);
          break;
        }
      }
      const row = findWorkdayExperienceRows()[i];
      if (!row) break;
      n += await fillWorkdayWorkExperienceRow(row, jobs[i], profile, filledSet, i);
      log('workday:experience row', i + 1, jobs[i].title || jobs[i].company || '');
    }
    if (n) log('workday:experience filled', jobs.length, 'jobs ops=', n);
    return n;
  }

  function fillWorkdayProfileConsentRadios(profile, filledSet) {
    let n = 0;
    for (const field of document.querySelectorAll('[data-automation-id^="formField"]')) {
      const label = workdayFieldLabel(field).toLowerCase();
      if (!/willing.*share|share your.*profile/i.test(label)) continue;

      const text = field.querySelector('input[type="text"], textarea');
      if (text && !isEmpty(text) && !looksLikeUrl(text.value)) {
        setNativeValue(text, '');
        log('workday:consent cleared invalid text in', label.slice(0, 40));
      }

      const radios = [...field.querySelectorAll('input[type="radio"]')].filter(isVisible);
      if (!radios.length || radios.some((r) => r.checked) || radios.some((r) => filledSet.has(r))) continue;

      let want = 'no';
      if (/facebook/.test(label) && profile.links?.facebook && looksLikeUrl(profile.links.facebook)) want = 'yes';
      if (/linkedin/.test(label) && profile.links?.linkedin && looksLikeUrl(profile.links.linkedin)) want = 'yes';

      const optText = (o) => {
        const aria = o.getAttribute('aria-label');
        if (aria) return aria.trim().toLowerCase();
        if (o.id) {
          const l = document.querySelector(`label[for="${CSS.escape(o.id)}"]`);
          if (l?.textContent) return l.textContent.trim().toLowerCase();
        }
        const cl = o.closest('label');
        if (cl?.textContent) return cl.textContent.trim().toLowerCase();
        const sib = o.nextElementSibling;
        if (sib?.textContent) return sib.textContent.trim().toLowerCase();
        return (o.value || '').trim().toLowerCase();
      };
      const opt =
        radios.find((o) => optText(o) === want) ||
        radios.find((o) => optText(o).startsWith(want));
      if (opt && !opt.checked) {
        opt.click();
        radios.forEach((r) => filledSet.add(r));
        n++;
        log('workday:consent', want, '<=', label.slice(0, 50));
      }
    }
    return n;
  }

  function fillWorkdaySocialUrls(profile, filledSet) {
    let n = 0;
    const pairs = [
      [/facebook/i, profile.links?.facebook],
      [/linkedin/i, profile.links?.linkedin],
      [/twitter|\bx\.com\b|\bx handle/i, profile.links?.twitter],
      [/github/i, profile.links?.github],
      [/portfolio|personal[\s_-]*site|\bwebsite\b/i, profile.links?.portfolio],
    ];
    for (const node of document.querySelectorAll(
      '[data-automation-id^="formField"], [data-automation-id*="social" i]',
    )) {
      const aid = (node.getAttribute('data-automation-id') || '').toLowerCase();
      const label = workdayFieldLabel(node).toLowerCase();
      const hay = `${aid} ${label}`;
      if (/willing.*share|share your.*profile/i.test(hay)) {
        const input = node.matches('input, textarea') ? node : node.querySelector('input:not([type=file]):not([type=hidden]), textarea');
        if (input && isVisible(input) && !filledSet.has(input)) {
          let url = null;
          if (/linkedin/i.test(hay) && profile.links?.linkedin && looksLikeUrl(profile.links.linkedin)) {
            url = profile.links.linkedin;
          }
          if (/facebook/i.test(hay) && profile.links?.facebook && looksLikeUrl(profile.links.facebook)) {
            url = profile.links.facebook;
          }
          if (url && isEmpty(input)) {
            setNativeValue(input, url);
            filledSet.add(input);
            n++;
            log('workday:url share', aid || label.slice(0, 40), '=', String(url).slice(0, 50));
          } else if (input && !isEmpty(input) && !looksLikeUrl(input.value)) {
            setNativeValue(input, '');
            log('workday:url cleared invalid share field', aid || label.slice(0, 30));
          }
        }
        continue;
      }
      let el = null;
      if (node.matches('input, textarea')) el = node;
      else el = node.querySelector('input:not([type=file]):not([type=hidden]), textarea');
      if (!el || !isVisible(el) || el.disabled || el.readOnly) continue;
      if (!isEmpty(el)) {
        const cur = (el.value || '').trim();
        if (cur && isUrlLikeField(hay, el) && !looksLikeUrl(cur)) {
          setNativeValue(el, '');
          log('workday:url cleared invalid', aid || label.slice(0, 30));
        } else if (filledSet.has(el)) {
          continue;
        } else {
          continue;
        }
      }
      if (filledSet.has(el)) continue;
      for (const [re, val] of pairs) {
        if (!val || !looksLikeUrl(val) || !re.test(hay)) continue;
        if (/willing|share your/i.test(hay)) continue;
        setNativeValue(el, val);
        filledSet.add(el);
        n++;
        log('workday:url', aid || label.slice(0, 30), '=', String(val).slice(0, 50));
        break;
      }
    }
    return n;
  }

  async function fillWorkdayEducation(profile, filledSet) {
    if (!isWorkdayExperienceStep()) return 0;
    const edu = profile.education?.[0];
    if (!edu) return 0;
    let n = 0;
    const fieldOfStudy = resolveEducationFieldOfStudy(edu, profile);
    const gradYear = parseJobDateParts(edu.end).year || (edu.end || '').match(/\b(19|20)\d{2}\b/)?.[0];
    const fromYear = gradYear ? String(Number(gradYear) - 4) : null;

    const schoolInput = document.querySelector(
      'input[data-automation-id="schoolName"], input[name="schoolName"], input[id*="schoolName" i]',
    );
    if (
      edu.school &&
      schoolInput &&
      isVisible(schoolInput) &&
      isEmpty(schoolInput) &&
      !filledSet.has(schoolInput)
    ) {
      const ok = await fillWorkdayTypeahead(schoolInput, edu.school, 'education.school', filledSet);
      if (!ok) {
        await setFieldValue(schoolInput, edu.school, 'education.school');
        filledSet.add(schoolInput);
      }
      n++;
      log('workday:education school', edu.school);
    }

    for (const field of document.querySelectorAll('[data-automation-id^="formField"]')) {
      const label = workdayFieldLabel(field).toLowerCase();
      const aid = (field.getAttribute('data-automation-id') || '').toLowerCase();
      const hay = `${aid} ${label}`;

      if (/gpa|overall result|grade point/i.test(hay)) {
        const input = field.querySelector('input:not([type=hidden])');
        const gpa = edu.gpa;
        if (
          gpa &&
          looksLikeGpa(gpa) &&
          input &&
          isVisible(input) &&
          isEmpty(input) &&
          !filledSet.has(input)
        ) {
          await setFieldValue(input, gpa, 'education.gpa');
          filledSet.add(input);
          n++;
          log('workday:education gpa', gpa);
        } else if (input && !isEmpty(input)) {
          const v = input.value.trim();
          if (!looksLikeGpa(v) && /bachelor|master|technology|degree|b\.tech|diploma/i.test(v)) {
            setNativeValue(input, '');
            log('workday:education cleared invalid GPA');
          }
        }
        continue;
      }

      if (
        /school|university|college/.test(hay) &&
        !/degree|field of study|gpa|overall result/.test(hay)
      ) {
        const input = field.querySelector('input:not([type=hidden])');
        if (edu.school && input && isVisible(input) && isEmpty(input) && !filledSet.has(input)) {
          const ok = await fillWorkdayTypeahead(input, edu.school, 'education.school', filledSet);
          if (ok) n++;
          else {
            await setFieldValue(input, edu.school, 'education.0.school');
            filledSet.add(input);
            n++;
            log('workday:education school', edu.school);
          }
        }
        continue;
      }

      if (/\bdegree\b/.test(hay) && !/field of study|gpa|overall result/.test(hay)) {
        const trigger = field.querySelector(
          'button[aria-haspopup="listbox"], [role="combobox"], button[data-automation-id]',
        );
        if (edu.degree && trigger && !filledSet.has(trigger)) {
          const cur = (trigger.textContent || '').toLowerCase().trim();
          if (!cur || /select one|search|^choose|^$/.test(cur)) {
            const want = normalizeWorkdayDegree(edu.degree);
            const ok = await setWorkdayDropdown(trigger, want);
            if (ok) {
              filledSet.add(trigger);
              n++;
              log('workday:education degree', want);
            }
          }
        }
        continue;
      }

      if (/field of study|\bmajor\b/.test(hay) && !/gpa|overall result/.test(hay)) {
        const input = field.querySelector('input:not([type=hidden]), textarea');
        if (fieldOfStudy && input && isVisible(input) && isEmpty(input) && !filledSet.has(input)) {
          const ok = await fillWorkdayTypeahead(input, fieldOfStudy, 'education.field', filledSet);
          if (!ok) {
            await setFieldValue(input, fieldOfStudy, 'education.0.field');
            filledSet.add(input);
          }
          n++;
          log('workday:education field', fieldOfStudy);
        }
        continue;
      }

      if (/firstyearattended|first[\s_-]*year/i.test(aid) || (/firstyear|first year|\bfrom\b/.test(hay) && /year|attended/i.test(hay))) {
        const input = field.querySelector(
          'input[data-automation-id="dateSectionYear-input"], input[aria-label*="Year" i]',
        );
        if (fromYear && input && isVisible(input) && isEmpty(input) && !filledSet.has(input)) {
          await setFieldValue(input, fromYear, 'education.from_year');
          filledSet.add(input);
          n++;
          log('workday:education from_year', fromYear);
        }
        continue;
      }

      if (/lastyearattended|last[\s_-]*year/i.test(aid) || (/lastyear|last year|\bto\b/.test(hay) && /year|attended/i.test(hay))) {
        const input = field.querySelector(
          'input[data-automation-id="dateSectionYear-input"], input[aria-label*="Year" i]',
        );
        if (gradYear && input && isVisible(input) && isEmpty(input) && !filledSet.has(input)) {
          await setFieldValue(input, gradYear, 'education.to_year');
          filledSet.add(input);
          n++;
          log('workday:education to_year', gradYear);
        }
      }
    }

    for (const input of document.querySelectorAll('input[data-automation-id="dateSectionYear-input"]')) {
      if (!isVisible(input) || !isEmpty(input) || filledSet.has(input)) continue;
      const ctx = `${input.id || ''} ${input.closest('[data-automation-id]')?.getAttribute('data-automation-id') || ''}`.toLowerCase();
      if (/education/.test(ctx) && /firstyearattended|firstyear/.test(ctx) && fromYear) {
        await setFieldValue(input, fromYear, 'education.from_year');
        filledSet.add(input);
        n++;
        log('workday:education from_year', fromYear);
      } else if (/education/.test(ctx) && /lastyearattended|lastyear/.test(ctx) && gradYear) {
        await setFieldValue(input, gradYear, 'education.to_year');
        filledSet.add(input);
        n++;
        log('workday:education to_year', gradYear);
      }
    }
    return n;
  }

  let workdaySkillsPassDone = false;
  let workdayAppQuestionsPassDone = false;
  let workdayVoluntaryPassDone = false;

  async function fillWorkdayExperiencePage(profile, filledSet, match) {
    if (!isWorkdayExperienceStep()) return 0;
    log('workday:experience page (My Experience)');
    if (IS_TOP_FRAME) fillUi.setPhase('Work experience & education…');
    let n = 0;
    n += await fillWorkdayWorkExperience(profile, filledSet);
    if (!workdaySkillsPassDone) {
      workdaySkillsPassDone = true;
      n += await fillWorkdaySkills(profile, filledSet, match);
    }
    n += await fillWorkdayLanguages(profile, filledSet);
    n += fillWorkdaySocialUrls(profile, filledSet);
    n += fillWorkdayProfileConsentRadios(profile, filledSet);
    n += await fillWorkdayEducation(profile, filledSet);
    n += fillWorkdayScreeningRadios(profile, filledSet);
    return n;
  }

  function isWorkdayApplicationQuestionsStep() {
    if (!isWorkdaySite()) return false;
    if (document.querySelector('input[data-automation-id="file-upload-input-ref"]'))
      return false;
    const hay = document.body.innerText.slice(0, 12000).toLowerCase();
    if (!/application questions/.test(hay)) return false;
    return /require sponsorship|visa sponsorship|authorized to work|legally authorized|work authorization|permit type|current employer|close personal|non-?compete|interviewed.*(?:last|earlier|before)|been employed|accreditation|certification/.test(
      hay,
    );
  }

  function resolveWorkPermitType(profile) {
    if (profile.work_permit_type) return String(profile.work_permit_type).trim();
    const country = profile.work_auth_country || profile.location?.country;
    if (profile.authorized_to_work !== false && country) {
      return `Citizen of ${country}`;
    }
    return null;
  }

  /** Universal Workday screening question → dropdown prefs (all tenants). */
  function workdayScreeningPrefsForQuestion(qRaw, profile) {
    const q = String(qRaw || '').toLowerCase();
    if (!q || q.length < 8) return null;

    const saved = matchCustomQa(q, profile.custom_qa);
    if (saved) return { prefs: [String(saved).toLowerCase()], strict: false };

    if (/visa sponsorship|require visa|require sponsorship/.test(q)) {
      return {
        prefs: profile.require_sponsorship
          ? ['yes', 'will require']
          : ['no', 'do not', 'not require'],
        strict: true,
      };
    }
    if (
      /legally authorized|authorized to work|eligible to work|right to work|legally permitted/.test(
        q,
      ) &&
      !/permit type|outline your work permit/.test(q)
    ) {
      return {
        prefs: profile.authorized_to_work === false ? ['no'] : ['yes'],
        strict: true,
      };
    }
    if (
      /citizen or permanent resident of one of these|one of these nations|these nations or regions/.test(
        q,
      )
    ) {
      return {
        prefs: ['does not apply', "doesn't apply", 'not applicable'],
        strict: true,
      };
    }
    if (/dual citizenship|hold dual/.test(q)) {
      return { prefs: ['does not apply', "doesn't apply", 'no'], strict: true };
    }
    if (
      /citizen or permanent resident|country of citizenship|nationality/.test(q) &&
      !/one of these/.test(q)
    ) {
      const country = profile.work_auth_country || profile.location?.country;
      if (country) return { prefs: [String(country).toLowerCase()], strict: false };
    }
    if (
      /relationship.*employed|employed by|family relationship|close personal|conflict of interest/.test(
        q,
      )
    ) {
      return { prefs: ['no'], strict: true };
    }
    if (/non-?compete|restrictive covenant/.test(q)) {
      return { prefs: ['no'], strict: true };
    }
    if (
      /interviewed.*(?:last|past|earlier|before)|been interviewed|interview.*(?:6|12)\s*months/.test(
        q,
      )
    ) {
      return { prefs: ['no'], strict: true };
    }
    if (
      /ever been employed|previously (?:employed|worked)|worked (?:at|for)|former(?:ly)? employ|been employed/.test(
        q,
      )
    ) {
      return { prefs: ['no'], strict: true };
    }
    if (
      /accreditation|certification|licen[cs]e|professional credential/.test(q) &&
      /\?|holding|relevant|describe/.test(q)
    ) {
      return {
        prefs: ['no', 'does not apply', "doesn't apply", 'not applicable', 'none'],
        strict: true,
      };
    }
    return null;
  }

  function workdayQuestionForControl(el) {
    const field =
      el.closest('[data-automation-id^="formField"]') ||
      (el.getAttribute('data-automation-id') || '').startsWith('formField')
        ? el
        : null;
    if (field) {
      const rich =
        field.querySelector('[data-automation-id="richText"]') ||
        field.querySelector('label') ||
        field.querySelector('p');
      if (rich?.textContent) {
        const t = rich.textContent.replace(/\s+/g, ' ').trim();
        if (t.length > 10 && !/^select one/i.test(t)) return t;
      }
      const clone = field.cloneNode(true);
      clone
        .querySelectorAll('button, input, textarea, select, [role="listbox"]')
        .forEach((n) => n.remove());
      const inner = (clone.textContent || '').replace(/\s+/g, ' ').trim();
      if (inner.length > 10 && !/^select one/i.test(inner)) return inner;
    }
    let block = field || el;
    for (let i = 0; i < 4; i++) {
      const prev = block.previousElementSibling;
      if (!prev) break;
      const t = (prev.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.length > 15 && /\?/.test(t)) return t;
      block = prev;
    }
    return labelForControl(el);
  }

  function findWorkdayEmptyDropdownTriggers() {
    const out = [];
    const seen = new Set();
    const add = (el) => {
      if (!el || seen.has(el) || !isVisible(el)) return;
      const cur = (el.textContent || '').toLowerCase().trim();
      if (cur && !/select one|search|^choose|^\s*$/.test(cur)) return;
      seen.add(el);
      out.push(el);
    };
    const sels = [
      'button[data-automation-id^="formField"]',
      '[data-automation-id^="formField"] button[type="button"]',
      'button[aria-haspopup="listbox"]',
      '[role="combobox"]',
      'div[data-automation-id][aria-haspopup="listbox"]',
    ];
    for (const sel of sels) {
      document.querySelectorAll(sel).forEach(add);
    }
    return out;
  }

  function fillWorkdayApplicationTextFields(profile, filledSet) {
    let n = 0;
    const permit = resolveWorkPermitType(profile);
    const pairs = [
      [/current employer|name of your current employer/i, profile.latest_company],
      [/current job title|your current job title/i, profile.current_title],
      [
        /permit type|work permit|outline your work permit|visa type|authorization type/i,
        permit,
      ],
    ];

    for (const field of document.querySelectorAll('[data-automation-id^="formField"]')) {
      const q = workdayQuestionForControl(field).toLowerCase();
      if (!q) continue;
      const el = field.querySelector('textarea, input[type="text"]');
      if (!el || !isVisible(el) || !isEmpty(el) || filledSet.has(el)) continue;
      for (const [re, val] of pairs) {
        if (!val || !re.test(q)) continue;
        setNativeValue(el, val);
        filledSet.add(el);
        n++;
        log('workday:appq-text', re.source.slice(0, 35), '=', String(val).slice(0, 40));
        break;
      }
    }

    for (const node of document.querySelectorAll('[data-automation-id]')) {
      const aid = (node.getAttribute('data-automation-id') || '').toLowerCase();
      let el = null;
      const tag = node.tagName;
      if (tag === 'TEXTAREA' || (tag === 'INPUT' && node.type === 'text')) el = node;
      else el = node.querySelector('textarea, input[type="text"]');
      if (!el || !isVisible(el) || !isEmpty(el) || filledSet.has(el)) continue;
      const hay = `${aid} ${fieldSignature(el)} ${workdayQuestionForControl(el).toLowerCase()}`;
      for (const [re, val] of pairs) {
        if (!val || !re.test(hay)) continue;
        setNativeValue(el, val);
        filledSet.add(el);
        n++;
        log('workday:appq-text', re.source.slice(0, 35), '=', String(val).slice(0, 40));
        break;
      }
    }
    return n;
  }

  async function fillWorkdayScreeningDropdowns(profile, filledSet) {
    let n = 0;
    for (const trigger of findWorkdayEmptyDropdownTriggers()) {
      if (filledSet.has(trigger)) continue;

      const q = workdayQuestionForControl(trigger).toLowerCase();
      const resolved = workdayScreeningPrefsForQuestion(q, profile);
      if (!resolved) continue;

      const { prefs, strict } = resolved;
      const ok = strict
        ? await setWorkdayDropdownStrict(trigger, prefs)
        : await setWorkdayDropdownByPrefs(trigger, prefs);
      if (ok) {
        filledSet.add(trigger);
        n++;
        log('workday:appq-dd', prefs[0], '<=', q.slice(0, 55));
      } else {
        log('workday:appq-dd failed', q.slice(0, 55));
      }
    }
    return n;
  }

  async function fillWorkdayApplicationQuestionsPage(profile, filledSet) {
    if (!isWorkdayApplicationQuestionsStep()) return 0;
    if (workdayAppQuestionsPassDone) return 0;
    workdayAppQuestionsPassDone = true;
    log('workday:application-questions page');
    if (IS_TOP_FRAME) fillUi.setPhase('Application questions…');
    let n = 0;
    n += fillWorkdayApplicationTextFields(profile, filledSet);
    n += await fillWorkdayScreeningDropdowns(profile, filledSet);
    n += fillWorkdayScreeningRadios(profile, filledSet);
    return n;
  }

  function genderDropdownPrefs(gender) {
    const g = String(gender || '')
      .toLowerCase()
      .trim();
    if (!g || /decline|prefer not|don't wish|not specified/.test(g)) {
      return ['decline to declare', 'decline', 'prefer not'];
    }
    if (/non.?binary|nb\b/.test(g)) return ['non-binary', 'nonbinary'];
    if (/female|woman/.test(g)) return ['woman', 'female'];
    if (/male|man\b/.test(g)) return ['man', 'male'];
    return [g, 'decline to declare'];
  }

  function veteranDropdownPrefs(status) {
    const s = String(status || '')
      .toLowerCase()
      .trim();
    if (!s || /not|no|none|decline|prefer not/.test(s)) {
      return [
        'i am not',
        'not a protected',
        'not a veteran',
        'no',
        'decline',
        'prefer not',
      ];
    }
    if (/yes|protected|veteran/.test(s)) {
      return ['protected veteran', 'yes', 'i am a'];
    }
    return [s];
  }

  function disabilityDropdownPrefs(status) {
    const s = String(status || '')
      .toLowerCase()
      .trim();
    if (!s || /not|no|none|decline|prefer not|don't have/.test(s)) {
      return [
        "don't have a disability",
        'no, i do not',
        'no disability',
        'not disabled',
        'decline',
        'prefer not',
      ];
    }
    if (/yes|have a disability|disabled/.test(s)) {
      return ['yes', 'have a disability', 'i have a disability'];
    }
    return [s];
  }

  function fillWorkdayConsentCheckboxes(filledSet) {
    let n = 0;
    for (const cb of document.querySelectorAll('input[type="checkbox"]')) {
      if (!isVisible(cb) || cb.checked || cb.disabled || filledSet.has(cb)) continue;
      const sig = fieldSignature(cb);
      if (/i consent|consent to|agree to|acknowledge/i.test(sig)) {
        cb.click();
        filledSet.add(cb);
        n++;
        log('workday:consent checked');
      }
    }
    return n;
  }

  async function fillWorkdayVoluntaryDropdowns(profile, filledSet) {
    let n = 0;
    for (const trigger of findWorkdayEmptyDropdownTriggers()) {
      if (filledSet.has(trigger)) continue;
      const q = workdayQuestionForControl(trigger).toLowerCase();
      if (!q || q.length < 6) continue;

      let prefs = null;
      if (/select your gender|\bgender\b/.test(q)) {
        prefs = genderDropdownPrefs(profile.gender);
      } else if (/veteran|armed forces|military service/.test(q)) {
        prefs = veteranDropdownPrefs(profile.veteran_status);
      } else if (/disabilit|\bdisabled\b/.test(q)) {
        prefs = disabilityDropdownPrefs(profile.disability_status);
      } else if (/ethnic|race\b|hispanic|latino/.test(q)) {
        prefs = ['decline', 'prefer not', 'do not wish'];
      }

      if (!prefs) continue;
      const ok = await setWorkdayDropdownStrict(trigger, prefs);
      if (ok) {
        filledSet.add(trigger);
        n++;
        log('workday:voluntary-dd', prefs[0], '<=', q.slice(0, 55));
      } else {
        log('workday:voluntary-dd failed', q.slice(0, 55));
      }
    }
    return n;
  }

  function isWorkdayVoluntaryDisclosuresStep() {
    if (!isWorkdaySite()) return false;
    const hay = document.body.innerText.slice(0, 12000).toLowerCase();
    return (
      /voluntary disclosures|voluntary self-identification|self-identification of/.test(hay) &&
      (/select your gender|gender\b|veteran|disabilit/.test(hay) || /i consent/.test(hay))
    );
  }

  async function fillWorkdayVoluntaryDisclosuresPage(profile, filledSet) {
    if (!isWorkdayVoluntaryDisclosuresStep()) return 0;
    if (workdayVoluntaryPassDone) return 0;
    workdayVoluntaryPassDone = true;
    log('workday:voluntary-disclosures page');
    let n = 0;
    n += await fillWorkdayVoluntaryDropdowns(profile, filledSet);
    n += fillWorkdayConsentCheckboxes(filledSet);
    return n;
  }

  // Hard rule: "How did you hear about us?" → always LinkedIn.
  async function fillWorkdaySourceLinkedIn(input, filledSet) {
    log('workday:source rule → LinkedIn');
    const ok = await setWorkdayMultiSelect(
      input,
      ['LinkedIn', 'linkedin'],
      false,
      true,
    );
    if (ok) {
      filledSet.add(input);
      log('workday:multiselect source linkedin');
    } else {
      log('workday:source failed — chip not committed');
    }
    return ok ? 1 : 0;
  }

  async function fillWorkdayMultiSelects(profile, filledSet) {
    let n = 0;
    const inputs = findWorkdayMultiSelectInputs();
    log('workday:ms scan found', inputs.length, 'multiselect inputs');
    for (const input of inputs) {
      if (filledSet.has(input)) {
        log('workday:ms skip already in filledSet');
        continue;
      }
      const container = workdayMsFieldRoot(input);
      const sig = `${wdAncestorAids(input)} ${labelForControl(input)}`.toLowerCase();
      const isSkillsField = /skill|type to add/i.test(sig);
      if (!isSkillsField && workdayMultiSelectFilled(container, input)) {
        log('workday:ms skip already has chip', wdAncestorAids(input).slice(0, 60));
        continue;
      }
      log('workday:ms try', sig.slice(0, 80));

      if (/source--source|how did you hear|hear about us|referral source/.test(sig)) {
        n += await fillWorkdaySourceLinkedIn(input, filledSet);
      } else if (/countryphonecode|phoneNumber--countryPhoneCode|country phone code/.test(sig)) {
        const country = profile.location?.country || profile.work_auth_country;
        if (!country) {
          log('workday:ms phoneCode skip — no country in profile');
          continue;
        }
        const ok = await setWorkdayMultiSelect(input, [country, `${country} (+`], false);
        if (ok) {
          filledSet.add(input);
          n++;
          log('workday:multiselect phoneCode');
        }
      }
    }
    return n;
  }

  function dumpScopedUnfilled(filledSet) {
    const rows = [];
    for (const el of scopedFillableElements()) {
      if (!isVisible(el) || filledSet.has(el) || el.type === 'hidden' || el.type === 'file') continue;
      if (!isEmpty(el)) continue;
      const vendor =
        el.getAttribute('data-ph-at-id') ||
        el.getAttribute('data-ph-id') ||
        el.getAttribute('data-field') ||
        el.closest('[data-ph-at-id], [data-field]')?.getAttribute('data-ph-at-id') ||
        '';
      const label = labelForControl(el).slice(0, 70).replace(/\s+/g, ' ');
      if (!label && !vendor) continue;
      rows.push(
        `${el.tagName.toLowerCase()}${el.type ? `[${el.type}]` : ''} vendor="${vendor}" label="${label}"`,
      );
    }
    if (rows.length) {
      log('universal:UNFILLED (' + rows.length + ') ↓\n' + rows.slice(0, 15).join('\n'));
    }
  }

  async function fillWorkday(profile, filledSet, match) {
    if (!isWorkdaySite()) return 0;
    let n = 0;
    const zip = profile.zip_code || profile.location?.zip;
    const phone = wdLocalPhone(profile.phone);

    // 0. multiSelect prompts FIRST (scroll+click promptIcon) — "How did you
    // hear" (hard rule: LinkedIn) and "Country Phone Code".
    n += await fillWorkdayMultiSelects(profile, filledSet);

    // 1. Text inputs keyed by data-automation-id (substring match, lowercased).
    const textMap = [
      ['legalnamesection_firstname', profile.first_name],
      ['firstname', profile.first_name],
      ['givenname', profile.first_name],
      ['legalnamesection_lastname', profile.last_name],
      ['lastname', profile.last_name],
      ['familyname', profile.last_name],
      ['addresssection_city', profile.location?.city],
      ['city', profile.location?.city],
      ['addresssection_postalcode', zip],
      ['postalcode', zip],
      ['phonenumber', phone],
      ['phone-number', phone],
      ['email', profile.email],
    ];
    // Workday puts data-automation-id on EITHER the <input> itself OR a wrapper
    // <div>, so scan every automation-id node and resolve the fillable input.
    const aidNodes = [...document.querySelectorAll('[data-automation-id]')];
    const allInputs = document.querySelectorAll('input, textarea, select');
    log(
      'workday:scan',
      'aidNodes=', aidNodes.length,
      'inputs=', allInputs.length,
      'host=', location.hostname,
    );
    for (const node of aidNodes) {
      const aid = (node.getAttribute('data-automation-id') || '').toLowerCase();
      if (!aid || aid.includes('beecatcher')) continue; // honeypot — leave empty
      const hit = textMap.find(([k]) => aid.includes(k));
      const val = hit?.[1];
      if (!val || String(val).trim() === '') continue;
      // Resolve the actual fillable control (node itself or nested input).
      let el = null;
      const tag = node.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') el = node;
      else el = node.querySelector('input, textarea');
      if (!el) continue;
      if (el.type === 'radio' || el.type === 'checkbox' || el.type === 'file') continue;
      if (!isVisible(el) || el.disabled || el.readOnly) continue;
      if (!isEmpty(el) || filledSet.has(el)) continue;
      setNativeValue(el, val);
      filledSet.add(el);
      n++;
      log('workday:text', aid, '=', String(val).slice(0, 30));
    }

    // 2. Custom dropdowns (button → listbox → option).
    const dropdowns = [
      [['country', 'countrydropdown', 'countryregion'], profile.location?.country || profile.work_auth_country],
      [['phone-device-type', 'phonedevicetype', 'phonetype'], 'Mobile'],
      [['country-phone-code', 'countryphonecode', 'phonecode'], profile.location?.country || profile.work_auth_country],
      [['addresssection_countryregion', 'state', 'region'], profile.location?.region],
    ];
    for (const [idParts, value] of dropdowns) {
      if (value == null || String(value).trim() === '') continue;
      const trigger = wdDropdownTrigger(idParts);
      if (!trigger || filledSet.has(trigger)) continue;
      // Skip if this widget already shows a chosen value.
      const cur = (trigger.textContent || '').toLowerCase();
      if (cur && !/select one|search|^\s*$/.test(cur) && cur.includes(String(value).toLowerCase())) continue;
      const ok = await setWorkdayDropdown(trigger, value);
      if (ok) {
        filledSet.add(trigger);
        n++;
        log('workday:dropdown', idParts[0], '=', String(value).slice(0, 30));
      }
    }

    // 3b. Fallback: some Workday tenants render "How did you hear" as a
    // button→listbox dropdown rather than a multiSelect.
    const srcTrigger = wdDropdownTrigger([
      'source',
      'how did you hear',
      'hear about',
      'referral',
    ]);
    if (srcTrigger && !filledSet.has(srcTrigger)) {
      const cur = (srcTrigger.textContent || '').toLowerCase().trim();
      if (!cur || /select one|search|^\s*$/.test(cur)) {
        const ok = await setWorkdayDropdownByPrefs(srcTrigger, [
          'linkedin',
          'job board',
          'indeed',
          'company website',
          'company site',
          'other',
        ]);
        if (ok) {
          filledSet.add(srcTrigger);
          n++;
          log('workday:source picked');
        }
      }
    }

    // 4. Yes/No screening radios with safe defaults (Simplify-style).
    n += fillWorkdayScreeningRadios(profile, filledSet);

    // 5. Page 2 "My Experience" — skills, LinkedIn/GitHub URLs.
    n += await fillWorkdayExperiencePage(profile, filledSet, match);

    // 6. Page 3 "Application Questions" — screening dropdowns + employer/title.
    n += await fillWorkdayApplicationQuestionsPage(profile, filledSet);

    // 7. Page 4 "Voluntary Disclosures" — EEO dropdowns + consent checkbox.
    n += await fillWorkdayVoluntaryDisclosuresPage(profile, filledSet);
    return n;
  }

  // Answer Workday Yes/No screening radios using heuristics + profile values.
  function fillWorkdayScreeningRadios(profile, filledSet) {
    let n = 0;
    const radios = [...document.querySelectorAll('input[type="radio"]')].filter(
      (r) => isVisible(r) && !r.disabled,
    );
    const groups = new Map();
    for (const r of radios) {
      const key =
        r.name ||
        r
          .closest('[role="radiogroup"], fieldset, [data-automation-id]')
          ?.getAttribute('data-automation-id') ||
        '';
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    for (const opts of groups.values()) {
      if (opts.some((o) => o.checked) || opts.some((o) => filledSet.has(o)))
        continue;
      const container = opts[0].closest(
        '[role="radiogroup"], fieldset, [data-automation-id]',
      );
      const q = (
        (container ? labelForControl(container) : '') ||
        opts.map((o) => labelForControl(o)).join(' ')
      ).toLowerCase();
      let want = null;
      if (/sponsor/.test(q)) {
        want = profile.require_sponsorship ? 'yes' : 'no';
      } else if (
        /authoriz|legally (?:able|entitled) to work|right to work|eligible to work|legally permitted/.test(
          q,
        )
      ) {
        want = profile.authorized_to_work === false ? 'no' : 'yes';
      } else if (
        /ever been employed|previously (?:employed|worked)|currently employed|former(?:ly)? employ|worked (?:at|for|on assignment)|intern or contract|relative|family member|related to|conflict of interest|been convicted|criminal/.test(
          q,
        )
      ) {
        want = 'no';
      } else if (/non-?compete|restrictive covenant/.test(q)) {
        want = 'no';
      } else if (
        /interviewed.*(?:last|past|earlier|before)|been interviewed|interview.*(?:6|12)\s*months/.test(
          q,
        )
      ) {
        want = 'no';
      } else if (
        /accreditation|certification|licen[cs]e|professional credential/.test(q) &&
        /\?|holding|relevant/.test(q)
      ) {
        want = 'no';
      } else if (/facebook|share your.*profile|social media profile/i.test(q)) {
        want = profile.links?.facebook && looksLikeUrl(profile.links.facebook) ? 'yes' : 'no';
      }
      if (!want) continue;
      const optText = (o) => {
        const aria = o.getAttribute('aria-label');
        if (aria) return aria.trim().toLowerCase();
        if (o.id) {
          const l = document.querySelector(`label[for="${CSS.escape(o.id)}"]`);
          if (l?.textContent) return l.textContent.trim().toLowerCase();
        }
        const cl = o.closest('label');
        if (cl?.textContent) return cl.textContent.trim().toLowerCase();
        const sib = o.nextElementSibling;
        if (sib && /^label$/i.test(sib.tagName) && sib.textContent)
          return sib.textContent.trim().toLowerCase();
        return (o.value || '').trim().toLowerCase();
      };
      const opt =
        opts.find((o) => optText(o) === want) ||
        opts.find((o) => optText(o).startsWith(want));
      if (opt && !opt.checked) {
        opt.click();
        filledSet.add(opt);
        opts.forEach((o) => filledSet.add(o));
        n++;
        log('workday:radio', want, '<=', q.slice(0, 50));
      }
    }
    return n;
  }

  function atsFillHooks() {
    return {
      log,
      isVisible,
      isEmpty,
      setFieldValue,
      setWorkdayDropdown,
      setGenericDropdownByPrefs,
      fillLeverTypeahead,
      applicationFormRoot,
      isUniversalCareerSite,
    };
  }

  async function runConfiguredAtsFill(profile, filledSet, ats) {
    const engine = window.__JobRadarAtsFill;
    if (!engine?.runAtsFill) return 0;
    const atsId =
      ats === 'generic' && isUniversalCareerSite() ? 'universal' : ats;
    return engine.runAtsFill(atsId, profile, filledSet, atsFillHooks());
  }

  async function fillAllFields(profile, match) {
    const filledSet = new Set();
    let total = 0;
    const ats = detectAts();
    // Config-driven ATS recipes run once — arrays click "Add" and must not repeat per pass.
    total += await runConfiguredAtsFill(profile, filledSet, ats);
    for (let pass = 0; pass < 3; pass++) {
      if (ats === 'workday') total += await fillWorkday(profile, filledSet, match);
      total += await fillByVendorAttributes(profile, filledSet);
      total += await fillLeverUrls(profile, filledSet);
      total += await executeFillPlan(profile, filledSet);
      total += await fillKnownFields(profile, filledSet);
      total += await fillGenericChoiceFields(profile, filledSet);
      total += fillGenericScreeningRadios(profile, filledSet);
      total += fillEssayFromProfile(profile, filledSet);
      if (pass < 2) await sleep(450);
    }
    total += await fillViaSemanticMap(profile, match, filledSet, { workdayAi: ats === 'workday' });
    if (ats === 'workday') {
      dumpWorkdayUnfilled(filledSet);
    } else {
      dumpScopedUnfilled(filledSet);
    }
    log('fillAllFields: filled', filledSet.size, 'elements in', total, 'operations');
    return filledSet.size;
  }

  // Diagnostic: list every still-empty / unanswered Workday control with a rich
  // signature so missed fields can be mapped precisely. One console block to
  // copy-paste — far more useful than a HAR (fills are DOM-based, not network).
  function dumpWorkdayUnfilled(filledSet) {
    const rows = [];
    const seen = new Set();
    const push = (el, kind) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      const aidOwn = el.getAttribute('data-automation-id') || '';
      const aidAnc =
        el.closest('[data-automation-id]')?.getAttribute('data-automation-id') || '';
      const label = labelForControl(el).slice(0, 60).replace(/\s+/g, ' ');
      rows.push(
        `${kind} <${el.tagName.toLowerCase()}${el.type ? ' type=' + el.type : ''}> aid="${aidOwn || aidAnc}" role="${el.getAttribute('role') || ''}" label="${label}"`,
      );
    };

    // Required containers Workday marks with an asterisk that have no value yet.
    document
      .querySelectorAll('input, textarea, select')
      .forEach((el) => {
        if (!isVisible(el) || filledSet.has(el)) return;
        if (el.type === 'hidden' || el.type === 'file') return;
        const empty =
          el.type === 'radio' || el.type === 'checkbox'
            ? !el.closest('[role="radiogroup"], fieldset')?.querySelector(':checked') && !el.checked
            : isEmpty(el);
        if (empty) push(el, el.type === 'radio' ? 'RADIO' : 'TEXT');
      });
    // Custom dropdown triggers still showing a placeholder.
    document
      .querySelectorAll(
        'button[aria-haspopup="listbox"], [role="combobox"], [data-automation-id][aria-haspopup="listbox"], button[data-automation-id^="formField"]',
      )
      .forEach((el) => {
        if (!isVisible(el) || filledSet.has(el)) return;
        const t = (el.textContent || '').toLowerCase().trim();
        if (!t || /select one|search|^choose|^\s*$/.test(t)) push(el, 'DROPDOWN');
      });

    if (rows.length) {
      log('workday:UNFILLED (' + rows.length + ') ↓\n' + rows.join('\n'));
    } else {
      log('workday:UNFILLED none — all detected fields filled');
    }
  }

  function dumpGenericUnfilled(filledSet) {
    const rows = [];
    const seen = new Set();
    for (const el of collectFillableElements()) {
      if (!isVisible(el) || filledSet.has(el) || el.type === 'hidden' || el.type === 'file')
        continue;
      if (!isEmpty(el)) continue;
      if (seen.has(el)) continue;
      seen.add(el);
      const label = labelForControl(el).slice(0, 70).replace(/\s+/g, ' ');
      if (!label || label.length < 2) continue;
      rows.push(
        `${el.tagName.toLowerCase()}${el.type ? `[${el.type}]` : ''} label="${label}"`,
      );
    }
    if (rows.length) {
      log('generic:UNFILLED (' + rows.length + ') ↓\n' + rows.slice(0, 15).join('\n'));
    }
  }

  function countFormSignals() {
    const inputs = applicationFormRoot().querySelectorAll(
      'input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select, button[data-automation-id^="formField"], [data-ph-at-id] input, [data-field] input',
    ).length;
    const vendorBlocks = applicationFormRoot().querySelectorAll(
      '[data-ph-at-id], [data-ph-id], [data-field], [data-field-id]',
    ).length;
    return Math.max(inputs, vendorBlocks > 2 ? vendorBlocks : 0);
  }

  const IS_TOP_FRAME = window === window.top;

  let autofillInFlight = null;
  async function triggerAutofillAllFrames(options) {
    if (autofillInFlight) {
      log('triggerAutofillAllFrames: already running');
      return autofillInFlight;
    }
    if (IS_TOP_FRAME) {
      busy = true;
      const est = Math.max(countEmptyFillableFields(), 8);
      fillUi.begin(est);
      fillUi.setPhase('Connecting to Hyred…');
    }
    autofillInFlight = (async () => {
      log('triggerAutofillAllFrames', 'ats=', detectAts(), 'vendor=', isUniversalCareerSite() ? 'universal' : 'other');
      return send('fanOutAutofill', { options });
    })();
    let res;
    try {
      res = await autofillInFlight;
    } finally {
      autofillInFlight = null;
    }
    log('fanOutAutofill:', JSON.stringify(res));
    const total = res?.filled || 0;
    const frames = res?.frames || 0;
    if (IS_TOP_FRAME) {
      const msg =
        total > 0
          ? `Done — ${total} field${total === 1 ? '' : 's'} filled`
          : 'Nothing filled — check console (F12) for [JobRadar]';
      fillUi.end(total, total > 0, msg);
      busy = false;
      toast(
        total > 0
          ? `Filled ${total} field${total === 1 ? '' : 's'} across ${frames} frame(s)`
          : 'No fields filled — open Console (F12) and filter [JobRadar]',
        total > 0 ? 'ok' : 'warn',
        5000,
      );
      setTimeout(() => refreshCardState(), 3500);
    }
    return res;
  }

  async function fillViaSemanticMap(profile, match, filledSet, opts = {}) {
    const workdayAi = opts.workdayAi === true || detectAts() === 'workday';
    const indexed = indexEmptyFields(filledSet, { forAi: workdayAi });
    if (!indexed.length) {
      log('mapFields: no empty labeled fields left');
      return 0;
    }
    let n = 0;
    const batches = [];
    for (let i = 0; i < indexed.length; i += 25) {
      batches.push(indexed.slice(i, i + 25));
    }
    for (const batch of batches) {
      log('mapFields: asking AI for', batch.length, 'fields');
      const res = await send('mapFields', {
        fields: batch.map(({ id, label, type }) => ({ id, label, type })),
        profile,
        job_title: match?.job?.title,
        company: match?.job?.company,
      });
      if (!res?.ok || !Array.isArray(res.mappings)) {
        log('mapFields skipped:', res?.error);
        continue;
      }
      for (const m of res.mappings) {
        const item = batch.find((x) => x.id === m.id);
        if (!item?.el || !m.value) continue;
        const applied = await applySemanticFieldValue(item, m.value);
        if (!applied) continue;
        if (item.els) item.els.forEach((r) => filledSet.add(r));
        else filledSet.add(item.el);
        n++;
        log('semantic:', item.label.slice(0, 50));
      }
    }
    return n;
  }

  async function applySemanticFieldValue(item, value) {
    const val = String(value ?? '').trim();
    if (!val) return false;
    if (item.kind === 'radio' && item.els?.length) {
      const want = val.toLowerCase();
      const optText = (o) => {
        const aria = o.getAttribute('aria-label');
        if (aria) return aria.trim().toLowerCase();
        if (o.id) {
          const l = document.querySelector(`label[for="${CSS.escape(o.id)}"]`);
          if (l?.textContent) return l.textContent.trim().toLowerCase();
        }
        const cl = o.closest('label');
        if (cl?.textContent) return cl.textContent.trim().toLowerCase();
        return (o.value || '').trim().toLowerCase();
      };
      const opt =
        item.els.find((o) => optText(o) === want) ||
        item.els.find((o) => optText(o).startsWith(want)) ||
        item.els.find((o) => want === 'yes' && /^(yes|true)$/i.test(optText(o))) ||
        item.els.find((o) => want === 'no' && /^(no|false)$/i.test(optText(o)));
      if (opt && !opt.checked) {
        opt.click();
        return true;
      }
      return false;
    }
    const el = item.el;
    if (!el || !isVisible(el)) return false;
    if (el.type === 'checkbox') {
      if (/^(yes|true|1)$/i.test(val) && !el.checked) {
        el.click();
        return true;
      }
      if (/^(no|false|0)$/i.test(val) && el.checked) {
        el.click();
        return true;
      }
      return false;
    }
    if (
      el.getAttribute('role') === 'spinbutton' ||
      /datesection(?:month|year)/i.test(el.getAttribute('data-automation-id') || '') ||
      /month|year/i.test(el.getAttribute('aria-label') || '')
    ) {
      if (!isEmpty(el) && !/mm|yyyy|invalid/i.test(el.value || '')) return false;
      await setWorkdayDatePart(el, val);
      return true;
    }
    if (el.tagName === 'SELECT') {
      return (await setGenericDropdownByPrefs(el, [val])) || setSelectValue(el, val);
    }
    if (/school|university/i.test(item.label) && isWorkdaySite()) {
      const ok = await fillWorkdayTypeahead(el, val, 'ai.school', new Set());
      if (ok) return true;
    }
    await setFieldValue(el, val, item.label.slice(0, 40));
    return true;
  }

  // -------------------------------------------------------------------
  // Fill fields — multi-pass for SPAs that mount inputs after first paint.
  // -------------------------------------------------------------------
  async function fillKnownFields(profile, filledSet) {
    const inputs = scopedFillableElements();
    let n = 0;
    for (const el of inputs) {
      if (!isVisible(el) || el.disabled) continue;
      if (el.readOnly && !prepareInputForFill(el)) continue;
      if (el.type === 'radio' || el.type === 'checkbox' || el.type === 'file') continue;
      if (!isEmpty(el) || filledSet.has(el)) continue;

      const sig = fieldSignature(el);
      if (!sig || isWorkdayDedicatedField(sig)) continue;

      let value = null;
      let path = matchRule(sig);
      if (path) value = normalizeFilledValue(el, path, valueForPath(profile, path), profile);
      if (!value) value = matchCustomQa(sig, profile.custom_qa);

      if (value != null && String(value).trim() !== '') {
        if (!shouldAcceptValue(el, sig, value)) continue;
        if (el.tagName === 'SELECT') {
          if (!(await setGenericDropdownByPrefs(el, [value]) || setSelectValue(el, value))) continue;
        } else {
          await setFieldValue(el, value, path || sig.slice(0, 40));
        }
        filledSet.add(el);
        n++;
        log('fill:', path || 'custom_qa', '=', String(value).slice(0, 40), '|', sig.slice(0, 50));
      }
    }
    return n;
  }

  function indexEmptyFields(filledSet, opts = {}) {
    const forAi = opts.forAi === true;
    const items = [];
    const radioGroupsDone = new Set();
    let id = 0;

    if (forAi && isWorkdaySite()) {
      for (const field of document.querySelectorAll('[data-automation-id^="formField"]')) {
        const radios = [...field.querySelectorAll('input[type="radio"]')].filter(isVisible);
        if (radios.length && !radios.some((r) => r.checked) && !radios.some((r) => filledSet.has(r))) {
          const key = field.getAttribute('data-automation-id') || radios.map((r) => r.name).join('|');
          if (radioGroupsDone.has(key)) continue;
          radioGroupsDone.add(key);
          const label = workdayFieldLabel(field).slice(0, 300);
          if (!label || label.length < 3) continue;
          items.push({
            id: id++,
            el: radios[0],
            els: radios,
            kind: 'radio',
            label,
            type: 'radio',
          });
        }
      }
    }

    for (const el of scopedFillableElements()) {
      if (!isVisible(el) || el.type === 'file' || el.type === 'hidden') continue;
      if (el.type === 'radio') continue;
      if (!isEmpty(el) || filledSet.has(el)) continue;
      const sig = fieldSignature(el);
      const label = (labelForControl(el) || sig).slice(0, 300);
      if (!label || label.length < 2) continue;
      if (!forAi && (isWorkdayDedicatedField(sig) || isWorkdayDedicatedField(label))) continue;
      items.push({
        id: id++,
        el,
        label,
        type: el.type || el.tagName.toLowerCase(),
      });
    }
    return items;
  }

  // -------------------------------------------------------------------
  // Resume file upload (Simplify-style — inject PDF into <input type="file">).
  // -------------------------------------------------------------------
  function findResumeFileInput() {
    const wd = document.querySelector(
      'input[data-automation-id="file-upload-input-ref"], input[data-automation-id*="file-upload" i][type="file"]',
    );
    if (wd) return wd;
    const root = applicationFormRoot();
    const inputs = [...root.querySelectorAll('input[type="file"]')];
    for (const inp of inputs) {
      const sig = fieldSignature(inp);
      if (/resume|cv|curriculum|vitae|attachment|drag|drop|upload/i.test(sig)) return inp;
      const zone = inp.closest(
        '[class*="upload"], [class*="resume"], [class*="file"], [class*="drop"], [data-ph-at-id*="resume" i], [data-ph-at-id*="cv" i]',
      );
      if (zone && /resume|cv|drag|drop|upload|attach/i.test(zone.textContent || '')) return inp;
    }
    for (const inp of inputs) {
      if (isVisible(inp)) return inp;
    }
    return inputs[0] || null;
  }

  async function uploadResume(matchId) {
    let input = findResumeFileInput();
    if (!input) {
      log('uploadResume: no file input found');
      return false;
    }
    if (input.files?.length) {
      log('uploadResume: input already has a file');
      return false;
    }
    const res = await send('fetchResume', { match_id: matchId });
    if (!res?.ok || !res.data_base64) {
      log('uploadResume failed:', res?.error);
      return false;
    }
    try {
      const bin = atob(res.data_base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], {
        type: res.content_type || 'application/pdf',
      });
      const file = new File([blob], res.filename || 'resume.pdf', {
        type: res.content_type || 'application/pdf',
      });
      const dt = new DataTransfer();
      dt.items.add(file);
      try {
        input.files = dt.files;
      } catch {
        const visible = input.closest('[class*="upload"], [class*="drop"]')?.querySelector(
          'input[type="file"]',
        );
        if (visible && visible !== input) {
          visible.files = dt.files;
          input = visible;
        }
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const zone = input.closest('[class*="upload"], [class*="drop"], [class*="file"]');
      if (zone) {
        zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true }));
      }
      log('uploadResume: attached', file.name);
      fillUi.onField(input, 'Resume');
      return true;
    } catch (e) {
      log('uploadResume error:', e);
      return false;
    }
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
  async function answerScreeningQuestions(matchId, profile) {
    const targets = [];
    for (const el of collectFillableElements()) {
      if (!looksLikeQuestionTextarea(el)) continue;
      if (!isVisible(el) || el.disabled || el.readOnly) continue;
      if (!isEmpty(el)) continue;
      targets.push(el);
    }
    if (!targets.length) return 0;

    let answered = 0;
    for (const el of targets.slice(0, 8)) {
      const sig = fieldSignature(el);
      const saved = matchCustomQa(sig, profile?.custom_qa);
      if (saved) {
        setNativeValue(el, saved);
        answered++;
        log('screening: reused saved answer');
        continue;
      }
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
        send('saveQa', { question, answer: res.answer });
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
        toast('Marked as applied in Hyred Job Tracker ✓', 'ok');
      },
      true,
    );
  }

  // -------------------------------------------------------------------
  // Main flow when the user clicks the floating button.
  // -------------------------------------------------------------------
  const DEFAULT_OPTS = {
    resume: true,
    coverLetter: true,
    commonFields: true,
    aiQuestions: true,
  };

  let busy = false;
  function setCardBusy(on) {
    const btn = document.getElementById('jobradar-card')?.querySelector('.jr-fill-btn');
    if (btn) {
      btn.disabled = on;
      btn.textContent = on ? 'Filling…' : 'Autofill this form';
    }
    const fab = document.getElementById('jobradar-fab');
    if (fab) {
      fab.setAttribute('aria-disabled', on ? 'true' : 'false');
      const lbl = fab.querySelector('.jr-label');
      if (lbl) lbl.textContent = on ? 'Working…' : 'Autofill';
    }
  }

  async function runAutofill(opts = {}) {
    const options = { ...DEFAULT_OPTS, ...opts };
    if (busy && !options.fromFanOut) return { filled: 0, skipped: true, reason: 'busy' };
    if (!options.fromFanOut) busy = true;
    if (IS_TOP_FRAME && !options.fromFanOut) {
      setCardBusy(true);
      if (!fillUi.active) fillUi.begin(Math.max(countEmptyFillableFields(), 6));
    }
    workdaySkillsPassDone = false;
    workdayAppQuestionsPassDone = false;
    workdayVoluntaryPassDone = false;

    let filled = 0;
    let resumeUploaded = false;
    let coverInjected = false;
    let answered = 0;
    let skipStatusMsg = '';

    try {
      log(
        '=== AUTOFILL START ===',
        IS_TOP_FRAME ? 'top' : 'child',
        location.href.slice(0, 90),
      );
      const ping = await send('ping');
      log('ping result:', JSON.stringify(ping));
      if (ping?.invalidated || /invalidated/i.test(ping?.error || '')) {
        if (!options.fromFanOut && IS_TOP_FRAME) {
          toast('Extension updated — refresh this page (Ctrl+Shift+R), then autofill again.', 'warn', 8000);
          refreshCardState();
        }
        return { filled: 0, error: 'invalidated' };
      }
      if (!ping?.connected) {
        log('NOT CONNECTED — token missing or invalid. ping:', JSON.stringify(ping));
        if (!options.fromFanOut && IS_TOP_FRAME) {
          toast(
            'Not connected. Click the extension popup → Connect to Hyred first.',
            'warn',
            8000,
          );
        }
        return { filled: 0, error: 'not_connected' };
      }

      const signals = countFormSignals();
      const wd = isWorkdayDom();
      if (isConfirmationOrPostApplyPage()) {
        skipStatusMsg =
          'Confirmation page — go back to the application form step';
        log('autofill skip: confirmation/post-apply page');
        if (!options.fromFanOut && IS_TOP_FRAME) {
          toast(
            'This is a confirmation page — go back to the application form step, then autofill.',
            'warn',
            8000,
          );
        }
        return { filled: 0, skipped: true, reason: 'confirmation_page' };
      }

      const emptyFields = countEmptyFillableFields();
      const hasForm = emptyFields >= 1 || wd || looksLikeApplicationForm();
      if (!hasForm) {
        skipStatusMsg = 'No application form on this page';
        log('autofill skip: empty frame signals=', signals, 'workdayDom=', wd);
        if (!options.fromFanOut && IS_TOP_FRAME) {
          toast('No application form found on this page.', 'warn', 6000);
        }
        return { filled: 0, skipped: true, reason: 'empty_frame' };
      }

      if (IS_TOP_FRAME && !options.fromFanOut && !fillUi.active) {
        fillUi.begin(Math.max(emptyFields, 6));
      }
      if (IS_TOP_FRAME) fillUi.setPhase('Loading your profile…');

      const [profileRes, matchRes] = await Promise.all([
        send('profile'),
        send('matchByUrl', { url: location.href }),
      ]);

      log('profile result:', JSON.stringify(profileRes?.ok), 'error:', profileRes?.error);
      log('match result:', JSON.stringify(matchRes?.ok), 'match:', !!matchRes?.match);

      if (!profileRes?.ok) {
        if (!options.fromFanOut && IS_TOP_FRAME) {
          toast(
            `Couldn't load your profile: ${profileRes?.error ?? 'unknown'}`,
            'err',
            6000,
          );
        }
        return { filled: 0, error: profileRes?.error };
      }
      const profile = profileRes.profile;
      const match = matchRes?.match ?? null;

      const ps = profile?.profile_structure;
      if (IS_TOP_FRAME && ps && isWorkdayExperienceStep()) {
        if (ps.readiness === 'empty') {
          toast(
            'No work history in profile. Extension → Profile → Refresh from resume.',
            'warn',
            8000,
          );
        } else if (ps.readiness === 'review') {
          toast(
            'Work experience not confirmed. Open Profile tab → Mark as reviewed, then autofill again.',
            'warn',
            9000,
          );
        }
      }

      if (IS_TOP_FRAME) fillUi.setPhase('Filling application…');

      const ats = detectAts();
      log(
        'ats:',
        ats,
        'host=',
        HOST,
        'workdayDom=',
        wd,
        'inputs=',
        signals,
      );

      log('profile keys:', Object.keys(profile || {}));
      log(
        'profile struct:',
        'work=',
        profile.work_history?.length ?? 0,
        'edu=',
        profile.education?.length ?? 0,
        'company=',
        profile.latest_company,
      );

      resumeUploaded = false;
      if (options.resume) {
        const fileInput = findResumeFileInput();
        if (fileInput && !fileInput.files?.length) {
          resumeUploaded = await uploadResume(match?.id);
          if (resumeUploaded) await sleep(1200);
        }
      }

      filled = options.commonFields ? await fillAllFields(profile, match) : 0;

      if (options.resume && !resumeUploaded && findResumeFileInput() && !findResumeFileInput().files?.length) {
        resumeUploaded = await uploadResume(match?.id);
      }

      if (options.coverLetter && match?.cover_letter) {
        coverInjected = injectCoverLetter(match.cover_letter);
      }

      if (options.aiQuestions) {
        answered = await answerScreeningQuestions(match?.id, profile);
      }

      attachApplyHook(match?.id);

      if (!options.fromFanOut) {
        const successCount = autofillSuccessCount(
          filled,
          resumeUploaded,
          coverInjected,
          answered,
        );
        const parts = [];
        if (options.commonFields && filled) {
          parts.push(`Filled ${filled} field${filled === 1 ? '' : 's'}`);
        }
        if (resumeUploaded) parts.push('resume uploaded');
        if (coverInjected) parts.push('cover letter injected');
        if (answered) parts.push(`${answered} screening Q answered`);
        if (!parts.length && emptyFields === 0) {
          parts.push('All fields already filled on this page');
        }
        if (match) parts.push(`match score ${match.score}`);
        if (match?.missing_skills?.length) {
          parts.push(`missing: ${match.missing_skills.slice(0, 3).join(', ')}`);
        }
        toast(
          parts.join(' · ') ||
            (successCount
              ? 'Autofill complete'
              : 'Nothing to fill — open the application form step first'),
          successCount ? 'ok' : 'warn',
          6500,
        );
      }
      log(
        '=== AUTOFILL END === filled:',
        filled,
        'resume:',
        resumeUploaded,
        'cover:',
        coverInjected,
        'answered:',
        answered,
      );
      return { filled, resumeUploaded, coverInjected, answered };
    } catch (e) {
      if (!options.fromFanOut && IS_TOP_FRAME) {
        toast(`Autofill failed: ${e?.message ?? e}`, 'err', 6000);
      }
      log('autofill error', e);
      return { filled: 0, error: String(e?.message ?? e) };
    } finally {
      if (!options.fromFanOut) busy = false;
      if (IS_TOP_FRAME && !options.fromFanOut) {
        const successCount = autofillSuccessCount(
          filled,
          resumeUploaded,
          coverInjected,
          answered,
        );
        let statusMsg = skipStatusMsg;
        if (!statusMsg && successCount === 0 && isConfirmationOrPostApplyPage()) {
          statusMsg = 'Confirmation page — open the application form first';
        } else if (!statusMsg && successCount === 0) {
          statusMsg = 'No empty fields — try the application form step';
        } else if (!statusMsg && resumeUploaded && filled === 0) {
          statusMsg = 'Resume uploaded · form fields already filled';
        }
        if (fillUi.active || successCount > 0 || skipStatusMsg) {
          fillUi.end(successCount, successCount > 0, statusMsg);
        }
        setCardBusy(false);
        if (!options.fromFanOut) refreshCardState();
      }
    }
  }

  // -------------------------------------------------------------------
  // Collapsed pill — small launcher shown after the card is dismissed.
  // -------------------------------------------------------------------
  function mountFab() {
    if (!IS_TOP_FRAME) return;
    if (document.getElementById('jobradar-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'jobradar-fab';
    fab.type = 'button';
    fab.title = 'Autofill with Hyred';
    fab.innerHTML =
      '<span class="jr-logo">H</span><span class="jr-label">Autofill</span>';
    fab.addEventListener('click', () => {
      fab.remove();
      cardDismissed = false;
      mountCard();
    });
    document.body.appendChild(fab);
    log('FAB pill mounted');
  }

  // -------------------------------------------------------------------
  // Simplify-style Copilot card — auto-appears when a form is detected.
  // -------------------------------------------------------------------
  let cardDismissed = false;

  function optsFromCard() {
    const card = document.getElementById('jobradar-card');
    const read = (k, def) => {
      const el = card?.querySelector(`input[data-opt="${k}"]`);
      return el ? el.checked : def;
    };
    return {
      resume: read('resume', true),
      coverLetter: read('coverLetter', true),
      commonFields: read('commonFields', true),
      aiQuestions: read('aiQuestions', true),
    };
  }

  function mountCard() {
    if (!IS_TOP_FRAME) return;
    if (cardDismissed || document.getElementById('jobradar-card')) return;
    const card = document.createElement('div');
    card.id = 'jobradar-card';
    card.innerHTML = `
      <div class="jr-card-head">
        <span class="jr-brand"><span class="jr-logo">H</span>Hyred Copilot</span>
        <button class="jr-x" type="button" title="Hide">&times;</button>
      </div>
      <div class="jr-card-status jr-detecting">Application form detected</div>
      <div class="jr-card-match jr-hidden"></div>
      <div class="jr-card-opts">
        <label><input type="checkbox" data-opt="resume" checked /> Resume</label>
        <label><input type="checkbox" data-opt="coverLetter" checked /> Cover letter</label>
        <label><input type="checkbox" data-opt="commonFields" checked /> Fields</label>
        <label><input type="checkbox" data-opt="aiQuestions" checked /> AI answers</label>
      </div>
      <div class="jr-fill-progress jr-hidden">
        <div class="jr-progress-row">
          <span class="jr-spinner" aria-hidden="true"></span>
          <span class="jr-progress-text">Preparing…</span>
        </div>
        <div class="jr-progress-track"><span class="jr-progress-fill"></span></div>
      </div>
      <button class="jr-fill-btn" type="button">Autofill this form</button>
      <div class="jr-card-hint"></div>
    `;
    document.body.appendChild(card);

    card.querySelector('.jr-x').addEventListener('click', () => {
      card.remove();
      cardDismissed = true;
      mountFab();
    });
    const fillBtn = card.querySelector('.jr-fill-btn');
    fillBtn.addEventListener('click', () => {
      if (busy || autofillInFlight) return;
      setCardBusy(true);
      fillUi.begin(Math.max(countEmptyFillableFields(), 8));
      fillUi.setPhase('Starting autofill…');
      triggerAutofillAllFrames(optsFromCard());
    });

    requestAnimationFrame(() => card.classList.add('jr-show'));
    log('Copilot card mounted');
    refreshCardState();
  }

  async function refreshCardState() {
    const card = document.getElementById('jobradar-card');
    if (!card) return;
    const statusEl = card.querySelector('.jr-card-status');
    const matchEl = card.querySelector('.jr-card-match');
    const hintEl = card.querySelector('.jr-card-hint');
    const fillBtn = card.querySelector('.jr-fill-btn');

    const ping = await send('ping');
    if (ping?.invalidated || /invalidated/i.test(ping?.error || '')) {
      statusEl.textContent = 'Extension updated';
      statusEl.className = 'jr-card-status jr-warn';
      hintEl.textContent = 'Refresh this page (Ctrl+Shift+R), then autofill again.';
      fillBtn.disabled = false;
      fillBtn.textContent = 'Refresh page first';
      return;
    }
    if (!ping?.connected) {
      statusEl.textContent = 'Not connected';
      statusEl.className = 'jr-card-status jr-warn';
      hintEl.textContent = 'Open the Hyred extension icon and click Connect.';
      fillBtn.disabled = true;
      fillBtn.textContent = 'Connect Hyred first';
      return;
    }

    statusEl.textContent = 'Ready to autofill';
    statusEl.className = 'jr-card-status jr-ok';
    fillBtn.disabled = false;
    fillBtn.textContent = 'Autofill this form';

    const res = await send('matchByUrl', { url: location.href });
    const match = res?.ok ? res.match : null;
    if (match?.job) {
      matchEl.classList.remove('jr-hidden');
      const score = match.score != null ? `${match.score}% match` : '';
      matchEl.innerHTML = `<span class="jr-match-title"></span><span class="jr-match-score"></span>`;
      matchEl.querySelector('.jr-match-title').textContent =
        `${match.job.title}${match.job.company ? ' · ' + match.job.company : ''}`;
      matchEl.querySelector('.jr-match-score').textContent = score;
    } else {
      matchEl.classList.add('jr-hidden');
    }
  }

  // -------------------------------------------------------------------
  // Listen for messages from the popup ("Autofill this page" button).
  // -------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'TRIGGER_AUTOFILL') {
      runAutofill(msg.payload?.options || {})
        .then((res) => sendResponse({ ok: true, ...res }))
        .catch((e) => sendResponse({ ok: false, error: String(e?.message ?? e) }));
      return true;
    }
    return false;
  });

  // -------------------------------------------------------------------
  // Auto-detect: known ATS host OR a page that looks like an app form.
  // Pops the Copilot card up automatically (once) the moment a form appears.
  // -------------------------------------------------------------------
  function maybeMount() {
    if (!IS_TOP_FRAME) return;
    if (cardDismissed) return;
    if (document.getElementById('jobradar-card')) return;
    if (shouldShowCopilotCard()) mountCard();
  }

  const EXT_VERSION = chrome.runtime?.getManifest?.().version || '?';
  log('content script loaded v' + EXT_VERSION, 'on', HOST, location.pathname);
  maybeMount();
  const obs = new MutationObserver(() => maybeMount());
  obs.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 60_000);
})();

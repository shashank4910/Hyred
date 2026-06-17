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
            done({ ok: false, error: err.message || 'no response' });
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

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Simplify-style field rules: regex on label signature → profile path.
  const FIELD_RULES = [
    [/(^|\b)first[_\s-]*name\b/i, 'first_name'],
    [/(^|\b)given[_\s-]*name\b/i, 'first_name'],
    [/(^|\b)fname\b/i, 'first_name'],
    [/(^|\b)last[_\s-]*name\b/i, 'last_name'],
    [/(^|\b)family[_\s-]*name\b/i, 'last_name'],
    [/(^|\b)lname\b/i, 'last_name'],
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
    [/available[_\s-]*(from|date)|start[_\s-]*date/i, 'available_from'],
    [/work[_\s-]*type|remote|hybrid|onsite/i, 'preferred_work_type'],
    [/travel/i, 'willing_to_travel'],
    [/relocat/i, 'relocation_cities'],

    [/gender\b/i, 'gender'],
    [/university|college|school/i, 'education.0.school'],
    [/degree|major|field of study/i, 'education.0.degree'],
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
    const fieldset = el.closest('fieldset');
    const legend = fieldset?.querySelector('legend');
    if (legend?.textContent) bits.push(legend.textContent);
    const group =
      el.closest('.field, .form-group, .form-field, .application-field, [class*="question"]') ||
      el.parentElement;
    if (group) {
      const gl = group.querySelector('label, .label, .question, h3, h4, p');
      if (gl?.textContent && gl !== el) bits.push(gl.textContent);
    }
    let sib = el.previousElementSibling;
    for (let i = 0; i < 2 && sib; i++, sib = sib.previousElementSibling) {
      if (sib.textContent?.trim()) bits.push(sib.textContent);
    }
    return bits.join(' ').replace(/\s+/g, ' ').trim();
  }

  function fieldSignature(el) {
    return [
      labelForControl(el),
      el.name,
      el.id,
      el.placeholder,
      el.getAttribute('aria-label'),
      el.getAttribute('data-testid'),
      el.getAttribute('data-automation-id'),
      el.getAttribute('data-qa'),
      el.getAttribute('autocomplete'),
      el.type,
      el.getAttribute('role'),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .slice(0, 300);
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
  // -------------------------------------------------------------------
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

  function valueForPath(profile, path) {
    const v = get(profile, path);
    if (v == null) return null;
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    const s = String(v).trim();
    return s || null;
  }

  function matchRule(sig, rules = FIELD_RULES) {
    for (const [re, path] of rules) {
      if (re.test(sig)) return path;
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
      collectFillableElements,
      isVisible,
      isEmpty,
      detectAts,
      queryByName,
    });
    let n = 0;
    for (const instr of plan) {
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
        setNativeValue(el, instr.value);
        filledSet.add(el);
        n++;
        log('engine:text', instr.fieldId, instr.blockLabel?.slice(0, 50));
      }
    }
    return n;
  }

  async function fillAllFields(profile, match) {
    const filledSet = new Set();
    let total = 0;
    for (let pass = 0; pass < 3; pass++) {
      total += await fillLeverUrls(profile, filledSet);
      total += await executeFillPlan(profile, filledSet);
      total += fillKnownFields(profile, filledSet);
      total += fillEssayFromProfile(profile, filledSet);
      if (pass < 2) await sleep(450);
    }
    total += await fillViaSemanticMap(profile, match, filledSet);
    if (detectAts() === 'lever') {
      const remaining = indexEmptyFields(filledSet);
      if (remaining.length) {
        log(
          'lever:still empty',
          remaining.map((r) => r.label.slice(0, 60)).join(' | '),
        );
      }
    }
    log('fillAllFields: filled', filledSet.size, 'elements in', total, 'operations');
    return filledSet.size;
  }

  async function fillViaSemanticMap(profile, match, filledSet) {
    const indexed = indexEmptyFields(filledSet);
    if (!indexed.length) return 0;
    const res = await send('mapFields', {
      fields: indexed.map(({ id, label, type }) => ({ id, label, type })),
      profile,
      job_title: match?.job?.title,
      company: match?.job?.company,
    });
    if (!res?.ok || !Array.isArray(res.mappings)) {
      log('mapFields skipped:', res?.error);
      return 0;
    }
    let n = 0;
    for (const m of res.mappings) {
      const item = indexed.find((x) => x.id === m.id);
      if (!item?.el || !m.value) continue;
      setNativeValue(item.el, m.value);
      filledSet.add(item.el);
      n++;
      log('semantic:', item.label.slice(0, 50));
    }
    return n;
  }

  // -------------------------------------------------------------------
  // Fill fields — multi-pass for SPAs that mount inputs after first paint.
  // -------------------------------------------------------------------
  function fillKnownFields(profile, filledSet) {
    const inputs = collectFillableElements();
    let n = 0;
    inputs.forEach((el) => {
      if (!isVisible(el) || el.disabled || el.readOnly) return;
      if (el.type === 'radio' || el.type === 'checkbox' || el.type === 'file') return;
      if (!isEmpty(el) || filledSet.has(el)) return;

      const sig = fieldSignature(el);
      if (!sig) return;

      let value = null;
      const path = matchRule(sig);
      if (path) value = valueForPath(profile, path);
      if (!value) value = matchCustomQa(sig, profile.custom_qa);

      if (value != null && String(value).trim() !== '') {
        if (el.tagName === 'SELECT') {
          if (!setSelectValue(el, value)) return;
        } else {
          setNativeValue(el, value);
        }
        filledSet.add(el);
        n++;
        log('fill:', path || 'custom_qa', '=', String(value).slice(0, 40), '|', sig.slice(0, 50));
      }
    });
    return n;
  }

  function indexEmptyFields(filledSet) {
    const items = [];
    let id = 0;
    for (const el of collectFillableElements()) {
      if (!isVisible(el) || el.type === 'file' || el.type === 'hidden') continue;
      if (!isEmpty(el) || filledSet.has(el)) continue;
      const label = labelForControl(el);
      if (!label || label.length < 2) continue;
      items.push({
        id: id++,
        el,
        label: label.slice(0, 300),
        type: el.type || el.tagName.toLowerCase(),
      });
    }
    return items;
  }

  // -------------------------------------------------------------------
  // Resume file upload (Simplify-style — inject PDF into <input type="file">).
  // -------------------------------------------------------------------
  function findResumeFileInput() {
    const inputs = [...document.querySelectorAll('input[type="file"]')];
    for (const inp of inputs) {
      if (!isVisible(inp)) continue;
      const sig = fieldSignature(inp);
      if (/resume|cv|curriculum|vitae|attachment/i.test(sig)) return inp;
    }
    return inputs.find((inp) => isVisible(inp)) || null;
  }

  async function uploadResume(matchId) {
    const input = findResumeFileInput();
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
      input.files = dt.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      log('uploadResume: attached', file.name);
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
    if (busy) return;
    busy = true;
    setCardBusy(true);
    toast('Filling form...', 'ok', 2000);

    try {
      log('=== AUTOFILL START ===');
      const ping = await send('ping');
      log('ping result:', JSON.stringify(ping));
      if (!ping?.connected) {
        log('NOT CONNECTED — token missing or invalid. ping:', JSON.stringify(ping));
        toast(
          'Not connected. Click the extension popup → Connect to Hyred first.',
          'warn',
          8000,
        );
        return;
      }

      const [profileRes, matchRes] = await Promise.all([
        send('profile'),
        send('matchByUrl', { url: location.href }),
      ]);

      log('profile result:', JSON.stringify(profileRes?.ok), 'error:', profileRes?.error);
      log('match result:', JSON.stringify(matchRes?.ok), 'match:', !!matchRes?.match);

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

      const ats = detectAts();
      let resumeUploaded = false;
      if (options.resume && ats === 'lever') {
        resumeUploaded = await uploadResume(match?.id);
        if (resumeUploaded) await sleep(1200);
      }

      const filled = options.commonFields
        ? await fillAllFields(profile, match)
        : 0;

      if (options.resume && ats !== 'lever') {
        resumeUploaded = await uploadResume(match?.id);
      }

      let coverInjected = false;
      if (options.coverLetter && match?.cover_letter) {
        coverInjected = injectCoverLetter(match.cover_letter);
      }

      const answered = options.aiQuestions
        ? await answerScreeningQuestions(match?.id, profile)
        : 0;

      attachApplyHook(match?.id);

      const parts = [];
      if (options.commonFields) {
        parts.push(`Filled ${filled} field${filled === 1 ? '' : 's'}`);
      }
      if (resumeUploaded) parts.push('resume uploaded');
      if (coverInjected) parts.push('cover letter injected');
      if (answered) parts.push(`${answered} screening Q answered`);
      if (match) parts.push(`match score ${match.score}`);
      if (match?.missing_skills?.length) {
        parts.push(
          `missing: ${match.missing_skills.slice(0, 3).join(', ')}`,
        );
      }
      toast(
        parts.join(' · ') +
          (filled < 3
            ? ' · Tip: complete Settings → Application Profile on Hyred for more fields'
            : ''),
        filled || coverInjected || answered || resumeUploaded ? 'ok' : 'warn',
        5500,
      );
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
    } catch (e) {
      toast(`Autofill failed: ${e?.message ?? e}`, 'err', 6000);
      log('autofill error', e);
    } finally {
      busy = false;
      setCardBusy(false);
    }
  }

  // -------------------------------------------------------------------
  // Collapsed pill — small launcher shown after the card is dismissed.
  // -------------------------------------------------------------------
  function mountFab() {
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
    fillBtn.addEventListener('click', () => runAutofill(optsFromCard()));

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
      runAutofill(msg.payload?.options || {});
      sendResponse({ ok: true });
    }
    return false;
  });

  // -------------------------------------------------------------------
  // Auto-detect: known ATS host OR a page that looks like an app form.
  // Pops the Copilot card up automatically (once) the moment a form appears.
  // -------------------------------------------------------------------
  function maybeMount() {
    if (cardDismissed) return;
    if (document.getElementById('jobradar-card')) return;
    const ats = detectAts();
    if (ats !== 'generic' || looksLikeApplicationForm()) {
      mountCard();
    }
  }

  log('content script loaded on', HOST, location.pathname);
  maybeMount();
  const obs = new MutationObserver(() => maybeMount());
  obs.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 60_000);
})();

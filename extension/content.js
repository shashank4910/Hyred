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
    trigger.click();
    let options = [];
    for (let i = 0; i < 8; i++) {
      await sleep(180);
      options = [
        ...document.querySelectorAll(
          'ul[role="listbox"] li[role="option"], [role="listbox"] [role="option"], div[data-automation-id="promptOption"], li[data-automation-id="promptOption"]',
        ),
      ].filter(isVisible);
      if (options.length) break;
    }
    return options;
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

  const MS_OPT_SEL =
    'ul[role="listbox"] li[role="option"], [role="listbox"] [role="option"], [data-automation-id="promptOption"], div[data-automation-id="promptLeafNode"], li[data-automation-id="promptOption"]';

  function msOptions() {
    return [...document.querySelectorAll(MS_OPT_SEL)].filter(
      (o) => isVisible(o) && (o.textContent || '').trim().length > 0,
    );
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

  // Open a Workday prompt control: scroll into view (Workday lazy-renders /
  // needs the field visible — this is the "live scroll" Simplify does), then
  // click to open the menu.
  async function openWorkdayPrompt(el) {
    try {
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
    } catch {
      try {
        el.scrollIntoView();
      } catch {
        /* ignore */
      }
    }
    await sleep(150);
    try {
      el.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.click();
  }

  // Workday multiSelect (chip-style): a text input that opens a prompt list on
  // click and filters as you type. Strategy: scroll+click to open, match an
  // option; if not present, type each candidate to filter; finally fall back to
  // the first real option for required fields with no exact value.
  async function setWorkdayMultiSelect(input, candidates, fallbackFirst) {
    const t = (o) => (o.textContent || '').toLowerCase().trim();
    const clickOpt = async (o) => {
      try {
        o.scrollIntoView({ block: 'center' });
      } catch {
        /* ignore */
      }
      o.click();
      await sleep(280);
    };
    const pick = (opts, cands) => {
      for (const c of cands) {
        const lc = String(c).toLowerCase().trim();
        if (!lc) continue;
        const hit =
          opts.find((o) => t(o) === lc) || opts.find((o) => t(o).includes(lc));
        if (hit) return hit;
      }
      return null;
    };

    await openWorkdayPrompt(input);
    let options = await waitMsOptions();
    log('workday:ms open optionsFound=', options.length);

    let hit = pick(options, candidates);

    if (!hit) {
      for (const c of candidates) {
        if (!c) continue;
        typeWorkday(input, String(c));
        options = await waitMsOptions();
        hit = pick(options, [c]);
        log('workday:ms type', String(c), 'optionsFound=', options.length);
        if (hit) break;
        typeWorkday(input, '');
        await sleep(150);
      }
    }

    if (!hit && fallbackFirst) {
      typeWorkday(input, '');
      await openWorkdayPrompt(input);
      options = await waitMsOptions();
      hit = options.find((o) => t(o).length > 1);
    }

    if (!hit) {
      log('workday:ms no option matched');
      return false;
    }
    await clickOpt(hit);
    return true;
  }

  async function fillWorkdayMultiSelects(profile, filledSet) {
    let n = 0;
    const inputs = [
      ...document.querySelectorAll(
        'input[data-automation-id="multiselectInputContainer"]',
      ),
    ].filter(isVisible);
    for (const input of inputs) {
      if (filledSet.has(input)) continue;
      const container =
        input.closest('[data-automation-id="multiSelectContainer"]') ||
        input.closest('[data-automation-id*="multiselect" i]') ||
        input.parentElement;
      // Skip if a value chip is already selected.
      if (
        container?.querySelector(
          '[data-automation-id="selectedItem"], [class*="selectedItem"]',
        )
      )
        continue;
      const lbl = labelForControl(input).toLowerCase();
      let ok = false;
      let kind = '';
      if (/how did you hear|hear about|source--source|referral/.test(lbl)) {
        kind = 'source';
        ok = await setWorkdayMultiSelect(
          input,
          ['linkedin', 'job board', 'indeed', 'company website', 'glassdoor', 'other'],
          true,
        );
      } else if (/phone code|country phone|countryphonecode/.test(lbl)) {
        kind = 'phoneCode';
        const country = profile.location?.country || profile.work_auth_country;
        if (country) ok = await setWorkdayMultiSelect(input, [country], false);
      }
      if (ok) {
        filledSet.add(input);
        n++;
        log('workday:multiselect', kind);
      }
    }
    return n;
  }

  async function fillWorkday(profile, filledSet) {
    if (detectAts() !== 'workday') return 0;
    let n = 0;
    const zip = profile.zip_code || profile.location?.zip;
    const phone = wdLocalPhone(profile.phone);

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

    // 3. multiSelect widgets (chip-style text inputs): "How did you hear about
    // us?" (pick a sensible source) and "Country Phone Code" (match country).
    n += await fillWorkdayMultiSelects(profile, filledSet);

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

  async function fillAllFields(profile, match) {
    const filledSet = new Set();
    let total = 0;
    const ats = detectAts();
    for (let pass = 0; pass < 3; pass++) {
      if (ats === 'workday') total += await fillWorkday(profile, filledSet);
      total += await fillLeverUrls(profile, filledSet);
      total += await executeFillPlan(profile, filledSet);
      total += fillKnownFields(profile, filledSet);
      total += fillEssayFromProfile(profile, filledSet);
      if (pass < 2) await sleep(450);
    }
    total += await fillViaSemanticMap(profile, match, filledSet);
    if (ats === 'workday') {
      dumpWorkdayUnfilled(filledSet);
    } else if (ats === 'lever') {
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
        'button[aria-haspopup="listbox"], [role="combobox"], [data-automation-id][aria-haspopup="listbox"]',
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

  const EXT_VERSION = chrome.runtime?.getManifest?.().version || '?';
  log('content script loaded v' + EXT_VERSION, 'on', HOST, location.pathname);
  maybeMount();
  const obs = new MutationObserver(() => maybeMount());
  obs.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 60_000);
})();

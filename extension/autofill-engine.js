// Hyred Autofill Engine — Simplify Copilot-style architecture:
//   1. Canonical field taxonomy (profile schema)
//   2. Label classifier (question text → field id)
//   3. Fill-plan builder (scan DOM → instructions)
//   4. ATS adapters consume the same plan (Lever uses name= shortcuts first)
//
// Inspired by open ATS autofill patterns: classify → map profile → execute.
(() => {
  'use strict';

  const TITLE_RE =
    /\b(senior|junior|lead|staff|principal|sr\.?|jr\.?|engineer|developer|manager|analyst|architect|consultant|specialist|director|tester|qa|sde|devops|designer|intern|associate|performance)\b/i;

  /** Canonical fields — mirrors Hyred apply_profiles + resume structure. */
  const FIELD_CATALOG = [
    { id: 'full_name', kind: 'text', patterns: [/(^|\b)full[_\s-]*name\b/i, /(^|\b)your[_\s-]*name\b/i] },
    { id: 'first_name', kind: 'text', patterns: [/(^|\b)first[_\s-]*name\b/i, /given[_\s-]*name/i] },
    { id: 'last_name', kind: 'text', patterns: [/(^|\b)last[_\s-]*name\b/i, /family[_\s-]*name/i, /surname/i] },
    { id: 'email', kind: 'text', patterns: [/e-?mail/i] },
    { id: 'phone', kind: 'text', patterns: [/phone|mobile|telephone|\btel\b/i] },
    { id: 'current_ctc', kind: 'text', patterns: [/current\s*ctc/i, /present\s*(ctc|salary|compensation)/i, /ctc.*breakdown/i] },
    { id: 'expected_ctc', kind: 'text', patterns: [/expected\s*ctc/i, /desired\s*(ctc|salary)/i, /salary\s*expect/i] },
    { id: 'notice_period', kind: 'choice', patterns: [/notice\s*period/i, /days.*notice/i, /joining\s*time/i, /how\s*many\s*days/i] },
    { id: 'work_from_office', kind: 'yesno', patterns: [/work\s*from\s*office/i, /willing.*office/i, /comfortable.*office/i, /onsite\s*work/i] },
    { id: 'current_company', kind: 'text', patterns: [/current\s*company/i, /current\s*employer/i, /present\s*company/i, /^\s*org\b/i] },
    { id: 'current_title', kind: 'text', patterns: [/job\s*title/i, /current\s*title/i, /designation/i, /position\b/i] },
    { id: 'location', kind: 'typeahead', patterns: [/current\s*location/i, /where.*located/i, /city.*location/i, /^\s*location\b/i] },
    { id: 'linkedin', kind: 'text', patterns: [/linked[\s_-]?in/i] },
    { id: 'github', kind: 'text', patterns: [/github/i] },
    { id: 'portfolio', kind: 'text', patterns: [/portfolio|personal\s*site|website/i] },
    { id: 'years_experience', kind: 'text', patterns: [/years?.*experience/i, /\byoe\b/i] },
    { id: 'university', kind: 'typeahead', patterns: [/university|college|school/i] },
    { id: 'degree', kind: 'text', patterns: [/degree|major|field of study/i] },
    { id: 'sponsorship', kind: 'yesno', patterns: [/sponsor|visa|require.*sponsorship/i] },
    { id: 'authorized_work', kind: 'yesno', patterns: [/authorized.*work|legally.*work|work\s*authorization/i] },
    { id: 'relocate', kind: 'yesno', patterns: [/willing.*relocat/i, /open.*relocat/i] },
    { id: 'gender', kind: 'text', patterns: [/gender\b/i] },
    { id: 'summary', kind: 'text', patterns: [/professional\s*summary/i, /^summary\b/i] },
  ];

  function looksLikeJobTitle(s) {
    return TITLE_RE.test(String(s || ''));
  }

  function resolveOrg(profile) {
    const wh = profile.work_history?.[0];
    let company = profile.latest_company || wh?.company;
    let title = profile.current_title || wh?.title;
    if (company && looksLikeJobTitle(company) && title && !looksLikeJobTitle(title)) {
      return title;
    }
    if (company && looksLikeJobTitle(company) && wh?.title && !looksLikeJobTitle(wh.title)) {
      return wh.title;
    }
    if (company && !looksLikeJobTitle(company)) return company;
    return null;
  }

  function resolveLocation(profile) {
    return (
      profile.location?.full ||
      [profile.location?.city, profile.location?.region, profile.location?.country]
        .filter(Boolean)
        .join(', ') ||
      null
    );
  }

  function workFromOfficeAnswer(profile) {
    const wt = String(profile.preferred_work_type || '').toLowerCase();
    if (wt === 'remote') return 'No';
    if (wt === 'onsite' || wt === 'hybrid') return 'Yes';
    return null;
  }

  function getValueForField(fieldId, profile) {
    switch (fieldId) {
      case 'full_name':
        return profile.full_name;
      case 'first_name':
        return profile.first_name;
      case 'last_name':
        return profile.last_name;
      case 'email':
        return profile.email;
      case 'phone':
        return profile.phone;
      case 'current_ctc':
        return profile.total_ctc;
      case 'expected_ctc':
        return profile.expected_ctc;
      case 'notice_period':
        return profile.notice_period;
      case 'work_from_office':
        return workFromOfficeAnswer(profile);
      case 'current_company':
        return resolveOrg(profile);
      case 'current_title':
        return profile.current_title || profile.work_history?.[0]?.title;
      case 'location':
        return resolveLocation(profile);
      case 'linkedin':
        return profile.links?.linkedin;
      case 'github':
        return profile.links?.github;
      case 'portfolio':
        return profile.links?.portfolio;
      case 'years_experience':
        return profile.years_experience;
      case 'university':
        return profile.education?.[0]?.school;
      case 'degree':
        return profile.education?.[0]?.degree || profile.education?.[0]?.field;
      case 'sponsorship':
        return profile.require_sponsorship == null
          ? null
          : profile.require_sponsorship
            ? 'Yes'
            : 'No';
      case 'authorized_work':
        return profile.authorized_to_work == null
          ? null
          : profile.authorized_to_work
            ? 'Yes'
            : 'No';
      case 'relocate':
        return profile.willing_to_relocate == null
          ? null
          : profile.willing_to_relocate
            ? 'Yes'
            : 'No';
      case 'gender':
        return profile.gender;
      case 'summary':
        return profile.summary;
      default:
        return null;
    }
  }

  function classifyField(signature) {
    const sig = String(signature || '').toLowerCase();
    if (!sig) return null;
    for (const entry of FIELD_CATALOG) {
      for (const re of entry.patterns) {
        if (re.test(sig)) return entry;
      }
    }
    return null;
  }

  function extractBlockLabel(block) {
    const el = block.querySelector(
      '.application-label, .text, label, legend, h3, h4, .question, p',
    );
    return (el?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function matchNoticePeriod(optionText, profileValue) {
    const opt = String(optionText).toLowerCase();
    const val = String(profileValue).toLowerCase();
    if (/immediate/.test(val) && /immediate/.test(opt)) return true;
    const valDays = parseInt(val.match(/\d+/)?.[0] || '', 10);
    if (!valDays) return opt.includes(val);
    const nums = (opt.match(/\d+/g) || []).map(Number);
    if (nums.length >= 2) return valDays >= nums[0] && valDays <= nums[1];
    if (nums.length === 1) return Math.abs(valDays - nums[0]) <= 15 || valDays <= nums[0];
    return opt.includes(val);
  }

  function matchYesNo(optionText, want) {
    const t = String(optionText).toLowerCase().trim();
    const w = String(want).toLowerCase();
    if (w === 'yes' || w === 'true') return /^(yes|y|true)\b/.test(t);
    if (w === 'no' || w === 'false') return /^(no|n|false)\b/.test(t);
    return t.includes(w) || w.includes(t);
  }

  function matchChoiceOption(fieldId, optionText, profileValue) {
    if (fieldId === 'notice_period') return matchNoticePeriod(optionText, profileValue);
    const def = FIELD_CATALOG.find((f) => f.id === fieldId);
    if (def?.kind === 'yesno') return matchYesNo(optionText, profileValue);
    const opt = String(optionText).toLowerCase();
    const val = String(profileValue).toLowerCase();
    return opt === val || opt.includes(val) || val.includes(opt);
  }

  function pickRadio(radios, fieldId, profileValue) {
    if (!radios?.length || profileValue == null) return null;
    let best = null;
    let bestScore = 0;
    for (const r of radios) {
      const label =
        r.labels?.[0]?.textContent ||
        r.closest('label')?.textContent ||
        r.value ||
        '';
      const t = label.replace(/\s+/g, ' ').trim();
      if (!t) continue;
      if (matchChoiceOption(fieldId, t, profileValue)) {
        const score = t.length;
        if (score > bestScore) {
          bestScore = score;
          best = r;
        }
      }
    }
    return best;
  }

  /**
   * Build fill instructions from DOM + profile.
   * Returns [{ kind, fieldId, value, el?, radios?, blockLabel? }]
   */
  function buildFillPlan(ctx) {
    const { profile, labelForControl, isVisible, isEmpty, detectAts } = ctx;
    const plan = [];
    const seen = new Set();

    const add = (instr) => {
      const key = instr.el || instr.radios?.[0]?.name || instr.blockLabel;
      if (!key || seen.has(key)) return;
      seen.add(key);
      plan.push(instr);
    };

    // Lever / ATS custom question blocks (Simplify scans these first).
    document
      .querySelectorAll(
        '.application-question, .application-field, [data-qa="application-field"]',
      )
      .forEach((block) => {
        const blockLabel = extractBlockLabel(block);
        if (!blockLabel) return;
        const field = classifyField(blockLabel);
        if (!field) return;
        const value = getValueForField(field.id, profile);
        if (value == null || String(value).trim() === '') return;

        const radios = [...block.querySelectorAll('input[type="radio"]')].filter(isVisible);
        if (radios.length) {
          add({ kind: 'radio', fieldId: field.id, value, radios, blockLabel });
          return;
        }

        const input = block.querySelector(
          'input:not([type="hidden"]):not([type="file"]):not([type="radio"]):not([type="checkbox"]), textarea, select',
        );
        if (!input || !isVisible(input) || !isEmpty(input)) return;
        add({
          kind: field.kind === 'typeahead' ? 'typeahead' : 'text',
          fieldId: field.id,
          value,
          el: input,
          blockLabel,
        });
      });

    // Generic scan for any remaining empty controls.
    for (const el of ctx.collectFillableElements()) {
      if (!isVisible(el) || el.type === 'file' || el.type === 'hidden') continue;
      if (!isEmpty(el) || seen.has(el)) continue;

      if (el.type === 'radio') continue; // handled via groups below

      const sig = ctx.fieldSignature(el);
      const field = classifyField(sig);
      if (!field) continue;
      const value = getValueForField(field.id, profile);
      if (value == null || String(value).trim() === '') continue;

      add({
        kind: field.kind === 'typeahead' ? 'typeahead' : 'text',
        fieldId: field.id,
        value,
        el,
        blockLabel: sig.slice(0, 80),
      });
    }

    // Radio groups not inside recognized blocks (group by name).
    const radioGroups = new Map();
    for (const r of ctx.collectFillableElements().filter((e) => e.type === 'radio')) {
      if (!isVisible(r) || !r.name) continue;
      if (!radioGroups.has(r.name)) radioGroups.set(r.name, []);
      radioGroups.get(r.name).push(r);
    }
    for (const radios of radioGroups.values()) {
      if (radios.some((r) => r.checked)) continue;
      const sig = radios.map((r) => labelForControl(r)).join(' ');
      const field = classifyField(sig);
      if (!field || field.kind === 'text') continue;
      const value = getValueForField(field.id, profile);
      if (value == null) continue;
      add({ kind: 'radio', fieldId: field.id, value, radios, blockLabel: sig.slice(0, 80) });
    }

  // Lever name= shortcuts (Postings API contract).
    if (detectAts() === 'lever') {
      const leverPairs = [
        ['name', 'full_name'],
        ['email', 'email'],
        ['phone', 'phone'],
        ['org', 'current_company'],
        ['location', 'location'],
      ];
      for (const [name, fieldId] of leverPairs) {
        const value = getValueForField(fieldId, profile);
        if (!value) continue;
        const el = ctx.queryByName?.(name);
        if (!el || !isVisible(el) || !isEmpty(el)) continue;
        add({
          kind: name === 'location' ? 'typeahead' : 'text',
          fieldId,
          value,
          el,
          blockLabel: `lever:${name}`,
          leverName: name,
        });
      }
    }

    return plan;
  }

  window.HyredAutofillEngine = {
    FIELD_CATALOG,
    classifyField,
    getValueForField,
    resolveOrg,
    resolveLocation,
    matchChoiceOption,
    pickRadio,
    buildFillPlan,
    looksLikeJobTitle,
  };
})();

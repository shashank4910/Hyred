// Tier B custom career form — field discovery, skeleton hash, passive capture.
(function (global) {
  'use strict';

  function hashStr(raw) {
    let h = 5381;
    for (let i = 0; i < raw.length; i++) {
      h = (h * 33) ^ raw.charCodeAt(i);
    }
    return (h >>> 0).toString(16);
  }

  function normalizeDomain(host) {
    return String(host || '')
      .replace(/^www\./i, '')
      .toLowerCase();
  }

  function stableFieldFingerprint(parts) {
    const label = String(parts.label || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    const raw = `${label}|${parts.widget_kind}|${parts.dom_order}`;
    return `f${hashStr(raw)}`;
  }

  function computeStructureHash(fields) {
    const sorted = fields
      .map((f) => f.field_fp)
      .sort()
      .join('|');
    return `s${hashStr(sorted)}`;
  }

  function parseDays(text) {
    const s = String(text || '').toLowerCase();
    if (/immediate|0 day|no notice|same day/.test(s)) return 0;
    const m = s.match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }

  function parseOptionDayRange(opt) {
    const t = String(opt || '').toLowerCase().trim();
    if (/immediate|same day|0 day/.test(t)) return { min: 0, max: 0 };
    const range = t.match(/(\d+)\s*[-–to]+\s*(\d+)/);
    if (range) return { min: parseInt(range[1], 10), max: parseInt(range[2], 10) };
    const plus = t.match(/(\d+)\s*\+/);
    if (plus) return { min: parseInt(plus[1], 10), max: 9999 };
    const single = t.match(/(\d+)/);
    if (single) {
      const n = parseInt(single[1], 10);
      return { min: n, max: n };
    }
    return null;
  }

  function resolveSemanticValue(key, profile) {
    if (!profile) return null;
    switch (key) {
      case 'email':
        return profile.email?.trim() || null;
      case 'phone':
        return profile.phone?.trim() || null;
      case 'first_name':
        return profile.first_name?.trim() || null;
      case 'last_name':
        return profile.last_name?.trim() || null;
      case 'full_name':
        return profile.full_name?.trim() || null;
      case 'current_title':
        return profile.current_title?.trim() || null;
      case 'current_company':
        return profile.latest_company?.trim() || null;
      case 'current_location':
        return (
          profile.location?.full ||
          [profile.location?.city, profile.location?.region, profile.location?.country]
            .filter(Boolean)
            .join(', ') ||
          null
        );
      case 'linkedin':
        return profile.links?.linkedin?.trim() || null;
      case 'github':
        return profile.links?.github?.trim() || null;
      case 'portfolio':
        return profile.links?.portfolio?.trim() || null;
      case 'notice_period_days':
        return profile.notice_period?.trim() || null;
      case 'total_experience_years':
        return profile.years_experience != null ? String(profile.years_experience) : null;
      case 'current_ctc':
        return profile.total_ctc?.trim() || null;
      case 'expected_ctc':
        return profile.expected_ctc?.trim() || null;
      case 'willing_to_relocate':
        if (profile.willing_to_relocate == null) return null;
        return profile.willing_to_relocate ? 'Yes' : 'No';
      case 'require_sponsorship':
        if (profile.require_sponsorship == null) return null;
        return profile.require_sponsorship ? 'Yes' : 'No';
      case 'authorized_to_work':
        if (profile.authorized_to_work == null) return null;
        return profile.authorized_to_work ? 'Yes' : 'No';
      case 'gender':
        return profile.gender?.trim() || null;
      default:
        return null;
    }
  }

  function pickDropdownOption(profileValue, options, semanticKey) {
    if (!options?.length) return profileValue?.trim() || null;
    const want = String(profileValue || '').toLowerCase().trim();
    if (!want) return null;

    const exact =
      options.find((o) => o.toLowerCase().trim() === want) ||
      options.find((o) => o.toLowerCase().includes(want)) ||
      options.find((o) => want.includes(o.toLowerCase().trim()));
    if (exact) return exact;

    if (semanticKey === 'notice_period_days' || semanticKey === 'total_experience_years') {
      const days = parseDays(want);
      if (days == null) return null;
      let best = null;
      let bestScore = -1;
      for (const opt of options) {
        const range = parseOptionDayRange(opt);
        if (!range) continue;
        if (days >= range.min && days <= range.max) {
          const score = range.max - range.min;
          if (score > bestScore) {
            bestScore = score;
            best = opt;
          }
        }
      }
      if (best) return best;
    }

    if (
      semanticKey === 'willing_to_relocate' ||
      semanticKey === 'require_sponsorship' ||
      semanticKey === 'authorized_to_work'
    ) {
      const yes = /^y|yes|true/i.test(want);
      const hit = options.find((o) =>
        yes ? /^(yes|y|true)\b/i.test(o.trim()) : /^(no|n|false)\b/i.test(o.trim()),
      );
      if (hit) return hit;
    }
    return null;
  }

  function classifyWidgetKind(el, ctx) {
    if (!el) return 'unknown';
    if (el.type === 'file') return 'file';
    if (el.type === 'radio') return 'radio';
    if (el.tagName === 'SELECT') return 'native_select';
    if (ctx.isDropdownWidget(el)) return 'custom_dropdown';
    if (
      el.getAttribute('role') === 'combobox' ||
      el.getAttribute('aria-autocomplete') === 'list' ||
      el.classList?.contains('tt-input')
    ) {
      return 'typeahead';
    }
    if (el.tagName === 'TEXTAREA' || ctx.isNativeTextControl?.(el)) return 'text';
    return 'text';
  }

  async function scrapeFieldOptions(field, ctx) {
    const el = field.el;
    if (!el) return [];
    if (field.widget_kind === 'native_select' && el.tagName === 'SELECT') {
      return [...el.options]
        .map((o) => (o.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((t) => t && !/^select|^choose|^please/i.test(t))
        .slice(0, 80);
    }
    if (field.widget_kind === 'custom_dropdown' && ctx.openGenericListbox) {
      const options = await ctx.openGenericListbox(el);
      return options
        .map((o) => (o.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 80);
    }
    return [];
  }

  async function discoverFields(ctx) {
    const root = ctx.applicationFormRoot?.() || document.body;
    const seen = new Set();
    const out = [];
    let order = 0;

    const addField = async (el, widget_kind) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      const label = (ctx.labelForControl?.(el) || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (!label || label.length < 2) return;
      if (/captcha|recaptcha|hcaptcha/i.test(label)) return;
      if (widget_kind === 'file') return;
      const dom_order = order++;
      const field_fp = stableFieldFingerprint({ label, widget_kind, dom_order });
      const field = { field_fp, dom_order, label, widget_kind, el, options: [] };
      if (widget_kind === 'native_select' || widget_kind === 'custom_dropdown') {
        field.options = await scrapeFieldOptions(field, ctx);
      }
      out.push(field);
    };

    // Pass 1: native selects (GlobalLogic hides these behind div UI — fill via select.value)
    for (const el of root.querySelectorAll('select')) {
      if (el.type === 'hidden') continue;
      await addField(el, 'native_select');
    }

    // Pass 2: radio groups (Gender on some career sites)
    const radioNames = new Set();
    for (const el of root.querySelectorAll('input[type="radio"]')) {
      if (!ctx.isVisible?.(el) || !el.name || radioNames.has(el.name)) continue;
      radioNames.add(el.name);
      await addField(el, 'radio');
    }

    // Pass 3: text inputs and custom dropdown triggers
    const candidates = root.querySelectorAll(
      'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=radio]), textarea, [role="combobox"], button[aria-haspopup="listbox"]',
    );

    for (const el of candidates) {
      if (!ctx.isVisible?.(el)) continue;
      if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') continue;
      if (seen.has(el)) continue;
      // Skip if a select in the same field group is already tracked
      let parent = el.parentElement;
      let skip = false;
      for (let i = 0; i < 6 && parent; i++) {
        const sel = parent.querySelector('select');
        if (sel && seen.has(sel)) {
          skip = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (skip) continue;

      const widget_kind = classifyWidgetKind(el, ctx);
      await addField(el, widget_kind);
    }

    return out;
  }

  async function buildCapturePayload(ctx, domain) {
    const fields = await discoverFields(ctx);
    if (fields.length < 2) return null;
    const structure_hash = computeStructureHash(fields);
    return {
      domain: normalizeDomain(domain),
      path: location.pathname.slice(0, 500),
      structure_hash,
      fields: fields.map(({ el, ...rest }) => rest),
    };
  }

  function schedulePassiveCapture(ctx, sendFn) {
    let stableTimer = null;
    let lastHash = '';
    let sent = false;

    const tryCapture = async () => {
      if (sent) return;
      const ping = await sendFn('ping');
      if (!ping?.connected) return;
      const payload = await buildCapturePayload(ctx, location.hostname);
      if (!payload || payload.fields.length < 2) return;
      if (payload.structure_hash === lastHash) return;
      lastHash = payload.structure_hash;
      sent = true;
      const res = await sendFn('captureFormTemplate', payload);
      ctx.log?.('tierB:capture', payload.domain, payload.structure_hash, res?.capture_count);
    };

    const debounced = () => {
      clearTimeout(stableTimer);
      stableTimer = setTimeout(tryCapture, 1200);
    };

    debounced();
    const obs = new MutationObserver(debounced);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
    setTimeout(() => obs.disconnect(), 45_000);
  }

  global.__HyredTierBForm = {
    normalizeDomain,
    stableFieldFingerprint,
    computeStructureHash,
    resolveSemanticValue,
    pickDropdownOption,
    classifyWidgetKind,
    discoverFields,
    scrapeFieldOptions,
    buildCapturePayload,
    schedulePassiveCapture,
  };
})(typeof window !== 'undefined' ? window : globalThis);

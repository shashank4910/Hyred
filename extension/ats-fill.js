// Hyred ATS Fill Engine v1 — config-driven recipes for Workday, Greenhouse, Lever, Ashby, universal.
(() => {
  'use strict';

  const MONTHS = {
    jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
    apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07',
    aug: '08', august: '08', sep: '09', sept: '09', september: '09',
    oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12',
  };

  function getPath(obj, path) {
    if (!path) return undefined;
    if (path.startsWith('_const:')) return path.slice(7);
    return path.split('.').reduce((o, k) => (o != null ? o[k] : undefined), obj);
  }

  function looksLikeUrl(v) {
    const s = String(v ?? '').trim();
    if (!s || /^(yes|no|n\/a|none)$/i.test(s)) return false;
    return /^https?:\/\//i.test(s) || /^www\./i.test(s) || /\.(com|org|net|io|in|co|dev)\b/i.test(s);
  }

  function looksLikeGpa(v) {
    return /^\d+(\.\d+)?(\s*\/\s*\d+)?$/.test(String(v ?? '').trim());
  }

  function parseDateParts(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return {};
    if (/present|current|now/i.test(s)) return { present: true };
    let month;
    let year;
    const my = s.match(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s*['']?(\d{2,4})\b/i,
    );
    if (my) {
      month = MONTHS[my[1].toLowerCase().slice(0, 3)] || MONTHS[my[1].toLowerCase()];
      year = my[2].length === 2 ? `20${my[2]}` : my[2];
    }
    const yOnly = s.match(/\b(19|20)\d{2}\b/);
    if (!year && yOnly) year = yOnly[0];
    return { month, year, present: false };
  }

  function fieldOfStudyFromDegree(degree) {
    const m = String(degree || '').match(/\bin\s+(.+)/i);
    return m?.[1]?.trim() || null;
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

  function normalizeDegreeForDropdown(degree, synonyms) {
    if (!degree || !synonyms) return degree;
    const d = String(degree).toLowerCase();
    if (/\b(ph\.?d|doctorate|doctor)\b/.test(d)) return synonyms.doctorate?.[0] || 'Doctorate';
    if (/\b(mba|m\.?b\.?a|master)\b/.test(d)) return synonyms.master?.[0] || 'Master';
    if (/\b(associate|a\.?a\.?)\b/.test(d)) return synonyms.associate?.[0] || 'Associate';
    if (/\b(b\.?tech|b\.?e\.?|bachelor|b\.?s\.?|b\.?a\.?)\b/.test(d)) return synonyms.bachelor?.[0] || 'Bachelor';
    return degree;
  }

  function resolveProfileValue(profile, spec, row, config, links) {
    const key = spec.profile;
    if (!key) return null;
    if (key === '_resume') return null;
    if (row && !key.startsWith('_')) {
      const rowVal = getPath(row, key);
      if (rowVal != null && String(rowVal).trim() !== '') {
        return typeof rowVal === 'boolean' ? (rowVal ? 'Yes' : 'No') : String(rowVal).trim();
      }
    }
    if (key === '_location') {
      return profile.location?.full || [profile.location?.city, profile.location?.region].filter(Boolean).join(', ') || null;
    }
    if (key === '_currently_working') {
      const end = row?.end || '';
      return /present|current|now/i.test(String(end)) || !String(end).trim();
    }
    if (key === '_start_month') return parseDateParts(row?.start).month || null;
    if (key === '_start_year') return parseDateParts(row?.start).year || null;
    if (key === '_end_month') {
      const p = parseDateParts(row?.end);
      return p.present ? null : p.month || null;
    }
    if (key === '_end_year') {
      const p = parseDateParts(row?.end);
      return p.present ? null : p.year || null;
    }
    if (key === '_start_month_year') {
      const p = parseDateParts(row?.start);
      return [p.month, p.year].filter(Boolean).join('/') || row?.start || null;
    }
    if (key === '_end_month_year') {
      const p = parseDateParts(row?.end);
      if (p.present) return 'Present';
      return [p.month, p.year].filter(Boolean).join('/') || row?.end || null;
    }
    if (key === '_grad_year') return parseDateParts(row?.end).year || row?.end || null;
    if (key === '_degree_dropdown') {
      return normalizeDegreeForDropdown(row?.degree, config.degreeSynonyms);
    }
    if (key === '_gpa') return null;
    if (key === '_website_url') {
      return links?.portfolio || links?.github || links?.linkedin || null;
    }
    if (key.startsWith('_const:')) return key.slice(7);
    const v = getPath(profile, key);
    if (v == null) return null;
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    const s = String(v).trim();
    return s || null;
  }

  function shouldFillValue(spec, value) {
    if (value == null || String(value).trim() === '') return false;
    if (spec.urlOnly && !looksLikeUrl(value)) return false;
    if (spec.numericOnly && !looksLikeGpa(value)) return false;
    return true;
  }

  function queryIn(root, selectors, ctx) {
    for (const sel of selectors) {
      try {
        const nodes = root.querySelectorAll(sel);
        for (const el of nodes) {
          if (el && (!ctx?.isVisible || ctx.isVisible(el))) return el;
        }
      } catch {
        /* invalid selector in old browsers */
      }
    }
    return null;
  }

  async function fillText(ctx, el, value, label) {
    if (!ctx.isVisible(el) || ctx.isEmpty(el) || ctx.filledSet.has(el)) return false;
    await ctx.setFieldValue(el, value, label);
    ctx.filledSet.add(el);
    return true;
  }

  async function fillCheckbox(ctx, el, checked) {
    if (!ctx.isVisible(el) || ctx.filledSet.has(el)) return false;
    if (!!el.checked === !!checked) return false;
    el.click();
    ctx.filledSet.add(el);
    return true;
  }

  async function pressEnterOn(el) {
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter', keyCode: 13 }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', code: 'Enter', keyCode: 13 }));
    await ctxSleep(200);
  }

  function ctxSleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function fillSearchField(ctx, el, value) {
    await ctx.setFieldValue(el, value, 'search');
    await ctxSleep(200);
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter', keyCode: 13 }));
    await ctxSleep(1200);
    const opt =
      [...document.querySelectorAll('[role="option"], [data-automation-id*="promptOption" i], li[role="option"]')]
        .filter(ctx.isVisible)
        .find((o) => (o.textContent || '').toLowerCase().includes(String(value).toLowerCase().slice(0, 12))) ||
      document.querySelector('[data-automation-id*="promptOption" i], [role="option"]');
    if (opt) {
      opt.click();
      await ctxSleep(200);
    }
  }

  async function fillFieldSpec(ctx, root, spec, value, config) {
    if (!shouldFillValue(spec, value)) return 0;
    const el = queryIn(root, spec.css || [], ctx);
    if (!el) return 0;
    if (spec.kind === 'resume') return 0;
    if (spec.kind === 'checkbox') {
      return (await fillCheckbox(ctx, el, value)) ? 1 : 0;
    }
    if (spec.kind === 'dropdown') {
      if (el.tagName === 'SELECT') {
        if (
          spec.profile === 'notice_period' &&
          ctx.setSelectNoticePeriod?.(el, value)
        ) {
          ctx.filledSet.add(el);
          return 1;
        }
        if (
          spec.profile === 'years_experience' &&
          ctx.setSelectExperienceYears?.(el, value)
        ) {
          ctx.filledSet.add(el);
          return 1;
        }
        if (ctx.setSelectValue?.(el, value)) {
          ctx.filledSet.add(el);
          return 1;
        }
      }
      if (ctx.setWorkdayDropdown && (await ctx.setWorkdayDropdown(el, value))) {
        ctx.filledSet.add(el);
        return 1;
      }
      if (ctx.setGenericDropdownByPrefs && (await ctx.setGenericDropdownByPrefs(el, [value]))) {
        ctx.filledSet.add(el);
        return 1;
      }
      return 0;
    }
    if (spec.searchEnter) {
      if (ctx.isEmpty(el) && !ctx.filledSet.has(el)) {
        await fillSearchField(ctx, el, value);
        ctx.filledSet.add(el);
        ctx.log('ats:search', spec.id, '=', String(value).slice(0, 40));
        return 1;
      }
      return 0;
    }
    if (spec.typeahead && ctx.fillLeverTypeahead) {
      if (await ctx.fillLeverTypeahead(el, value)) {
        ctx.filledSet.add(el);
        return 1;
      }
    }
    if (await fillText(ctx, el, value, spec.id)) {
      ctx.log('ats:field', spec.id, '=', String(value).slice(0, 40));
      return 1;
    }
    return 0;
  }

  async function clickAddButton(ctx, addCss) {
    for (const sel of addCss) {
      const btn = document.querySelector(sel);
      if (btn && ctx.isVisible(btn)) {
        btn.scrollIntoView({ block: 'center', behavior: 'instant' });
        await ctxSleep(100);
        btn.click();
        await ctxSleep(600);
        return true;
      }
    }
    return false;
  }

  function findRows(rowCss) {
    for (const sel of rowCss) {
      try {
        const rows = [...document.querySelectorAll(sel)].filter((r) => r.querySelector('input, textarea, button'));
        if (rows.length) return rows;
      } catch {
        /* ignore */
      }
    }
    return [];
  }

  async function ensureRowCount(ctx, arraySpec, want) {
    let rows = findRows(arraySpec.rowCss);
    let guard = 0;
    while (rows.length < want && guard < want + 2) {
      const added = await clickAddButton(ctx, arraySpec.addCss || []);
      if (!added) {
        ctx.log('ats:array', arraySpec.id, 'skipped: add button not found');
        break;
      }
      await ctxSleep(500);
      rows = findRows(arraySpec.rowCss);
      guard++;
    }
    return rows;
  }

  async function runArray(ctx, config, arraySpec, profile) {
    let items = getPath(profile, arraySpec.profile) || [];
    if (arraySpec.id === 'websites') {
      const links = profile.links || {};
      items = [links.portfolio, links.github, links.linkedin, links.twitter].filter(Boolean);
    }
    if (!Array.isArray(items) || !items.length) return 0;
    const max = arraySpec.max || 5;
    const slice = items.slice(0, max);
    let n = 0;
    const links = profile.links || {};
    for (let i = 0; i < slice.length; i++) {
      const rows = await ensureRowCount(ctx, arraySpec, i + 1);
      const root = rows[i] || document;
      const row = slice[i];
      for (const field of arraySpec.fields || []) {
        let value = resolveProfileValue(profile, field, row, config, links);
        if (arraySpec.id === 'websites' && field.id === 'url') value = typeof row === 'string' ? row : value;
        if (field.id === 'major') {
          if (!value || isLikelyCityName(value, profile)) {
            value = fieldOfStudyFromDegree(row?.degree);
          }
        }
        n += await fillFieldSpec(ctx, root, field, value, config);
      }
      await ctxSleep(300);
    }
    if (n) ctx.log('ats:array', arraySpec.id, 'filled', slice.length, 'rows');
    return n;
  }

  async function runSimpleFields(ctx, config, profile, root) {
    let n = 0;
    const links = profile.links || {};
    for (const spec of config.fields || []) {
      if (spec.kind === 'resume') continue;
      const value = resolveProfileValue(profile, spec, null, config, links);
      n += await fillFieldSpec(ctx, root, spec, value, config);
    }
    return n;
  }

  async function runDropdowns(ctx, config, profile) {
    let n = 0;
    for (const dd of config.dropdowns || []) {
      const value = resolveProfileValue(profile, { profile: dd.profile }, null, config, {});
      if (!value) continue;
      for (const sel of dd.triggerCss || []) {
        const trigger = document.querySelector(sel);
        if (!trigger || !ctx.isVisible(trigger) || ctx.filledSet.has(trigger)) continue;
        const cur = (trigger.textContent || '').toLowerCase();
        if (cur && !/select one|search|^choose|^$/.test(cur) && cur.includes(String(value).toLowerCase())) continue;
        let ok = false;
        if (ctx.setWorkdayDropdown) ok = await ctx.setWorkdayDropdown(trigger, value);
        else if (ctx.setGenericDropdownByPrefs) ok = await ctx.setGenericDropdownByPrefs(trigger, [value]);
        if (ok) {
          ctx.filledSet.add(trigger);
          n++;
          ctx.log('ats:dropdown', dd.id, '=', String(value).slice(0, 30));
          break;
        }
      }
    }
    return n;
  }

  function configForAts(atsId, ctx) {
    const reg = window.__JR_ATS || {};
    if (atsId === 'universal' && reg.universal) return reg.universal;
    if (atsId === 'workday' && reg.workday) return reg.workday;
    if (atsId === 'greenhouse' && reg.greenhouse) return reg.greenhouse;
    if (atsId === 'lever' && reg.lever) return reg.lever;
    if (atsId === 'ashby' && reg.ashby) return reg.ashby;
    if (ctx.isUniversalCareerSite?.()) return reg.universal;
    if (atsId === 'generic') return reg.universal;
    const mapped = reg[atsId];
    if (mapped) return mapped;
    return reg.universal;
  }

  async function runAtsFill(atsId, profile, filledSet, hooks) {
    const ctx = {
      ...hooks,
      filledSet,
      log: hooks.log || ((...a) => console.log('[JobRadar]', ...a)),
    };
    const config = configForAts(atsId, ctx);
    if (!config) {
      ctx.log('ats:fill no config for', atsId);
      return 0;
    }
    const root = hooks.applicationFormRoot?.() || document;
    ctx.log('ats:fill start', config.id, 'method=', config.method);
    let n = 0;
    n += await runSimpleFields(ctx, config, profile, root);
    n += await runDropdowns(ctx, config, profile);
    for (const arr of config.arrays || []) {
      n += await runArray(ctx, config, arr, profile);
    }
    ctx.log('ats:fill done', config.id, 'ops=', n);
    return n;
  }

  window.__JobRadarAtsFill = {
    runAtsFill,
    configForAts,
    resolveProfileValue,
    parseDateParts,
  };
})();

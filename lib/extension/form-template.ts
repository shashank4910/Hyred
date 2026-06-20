import type { AutofillProfile } from './profile';

/** Field structure stored in Supabase — no user values. */
export type FormTemplateField = {
  field_fp: string;
  dom_order: number;
  label: string;
  widget_kind: string;
  semantic_key?: string | null;
  semantic_conf?: number;
  options?: string[];
  required?: boolean;
};

export type FormTemplateRow = {
  id: string;
  domain: string;
  path_pattern: string;
  structure_hash: string;
  status: string;
  confidence: number;
  fields: FormTemplateField[];
};

export function normalizeDomain(host: string): string {
  return host.replace(/^www\./i, '').toLowerCase();
}

export function stableFieldFingerprint(parts: {
  label: string;
  widget_kind: string;
  dom_order: number;
}): string {
  const label = parts.label.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
  const raw = `${label}|${parts.widget_kind}|${parts.dom_order}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) {
    h = (h * 33) ^ raw.charCodeAt(i);
  }
  return `f${(h >>> 0).toString(16)}`;
}

export function computeStructureHash(fields: { field_fp: string }[]): string {
  const sorted = [...fields].map((f) => f.field_fp).sort().join('|');
  let h = 5381;
  for (let i = 0; i < sorted.length; i++) {
    h = (h * 33) ^ sorted.charCodeAt(i);
  }
  return `s${(h >>> 0).toString(16)}`;
}

export function hashReporter(profileId: string): string {
  let h = 5381;
  for (let i = 0; i < profileId.length; i++) {
    h = (h * 33) ^ profileId.charCodeAt(i);
  }
  return `r${(h >>> 0).toString(16)}`;
}

/** Resolve profile value for a semantic key — no LLM. */
export function resolveProfileSemanticValue(
  key: string,
  profile: AutofillProfile,
): string | null {
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

function parseDays(text: string): number | null {
  const s = String(text || '').toLowerCase();
  if (/immediate|0 day|no notice|same day/.test(s)) return 0;
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function parseOptionDayRange(opt: string): { min: number; max: number } | null {
  const t = opt.toLowerCase().trim();
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

/** Pick best dropdown option for notice period / experience buckets. */
export function pickDropdownOption(
  profileValue: string,
  options: string[],
  semanticKey: string,
): string | null {
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
    let best: string | null = null;
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
    for (const opt of options) {
      const range = parseOptionDayRange(opt);
      if (range && days <= range.max && range.min >= days) {
        return opt;
      }
    }
  }

  if (semanticKey === 'willing_to_relocate' || semanticKey === 'require_sponsorship' || semanticKey === 'authorized_to_work') {
    const yes = /^y|yes|true/i.test(want);
    const hit = options.find((o) =>
      yes ? /^(yes|y|true)\b/i.test(o.trim()) : /^(no|n|false)\b/i.test(o.trim()),
    );
    if (hit) return hit;
  }

  return null;
}

export const QUORUM_CAPTURES = 3;

export function mergeTemplateFields(
  existing: FormTemplateField[],
  incoming: FormTemplateField[],
): FormTemplateField[] {
  const byFp = new Map(existing.map((f) => [f.field_fp, { ...f }]));
  for (const f of incoming) {
    const cur = byFp.get(f.field_fp);
    if (!cur) {
      byFp.set(f.field_fp, { ...f });
      continue;
    }
    cur.label = f.label || cur.label;
    cur.widget_kind = f.widget_kind || cur.widget_kind;
    cur.dom_order = Math.min(cur.dom_order, f.dom_order);
    if (f.options?.length) {
      const set = new Set([...(cur.options || []), ...f.options]);
      cur.options = [...set].slice(0, 80);
    }
    if (
      f.semantic_key &&
      (!cur.semantic_key ||
        (f.semantic_conf ?? 0) >= (cur.semantic_conf ?? 0))
    ) {
      cur.semantic_key = f.semantic_key;
      cur.semantic_conf = f.semantic_conf;
    }
  }
  return [...byFp.values()].sort((a, b) => a.dom_order - b.dom_order);
}

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isExtAuthed } from '@/lib/extension/auth';
import { corsPreflight, corsResponse } from '@/lib/extension/cors';
import {
  type FormTemplateField,
  QUORUM_CAPTURES,
  computeStructureHash,
  hashReporter,
  mergeTemplateFields,
  normalizeDomain,
} from '@/lib/extension/form-template';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/extension/form-template/capture
 * Passive structure capture — labels, widget kinds, dropdown options only (no values).
 */
export async function POST(req: NextRequest) {
  const auth = await isExtAuthed(req);
  if (!auth?.profile_id) {
    return corsResponse({ error: 'unauthorized' }, { status: 401 });
  }

  let body: {
    domain?: string;
    path?: string;
    structure_hash?: string;
    fields?: FormTemplateField[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return corsResponse({ error: 'invalid body' }, { status: 400 });
  }

  const domain = normalizeDomain(body.domain || '');
  const path = (body.path || '/').slice(0, 500);
  const fields = Array.isArray(body.fields) ? body.fields.slice(0, 60) : [];
  if (!domain || !fields.length) {
    return corsResponse({ error: 'domain and fields required' }, { status: 400 });
  }

  const structureHash =
    body.structure_hash || computeStructureHash(fields.map((f) => ({ field_fp: f.field_fp })));
  const reporterHash = hashReporter(auth.profile_id);
  const sb = supabaseAdmin();

  const { data: existingTpl } = await sb
    .from('domain_form_templates')
    .select('id, fields, capture_count, status, confidence')
    .eq('domain', domain)
    .eq('structure_hash', structureHash)
    .maybeSingle();

  let templateId = existingTpl?.id as string | undefined;

  const { error: capErr } = await sb.from('domain_form_captures').upsert(
    {
      template_id: templateId ?? null,
      domain,
      structure_hash: structureHash,
      reporter_hash: reporterHash,
      fields,
    },
    { onConflict: 'domain,structure_hash,reporter_hash' },
  );
  if (capErr) {
    return corsResponse({ error: capErr.message }, { status: 500 });
  }

  const { count: reporterCount } = await sb
    .from('domain_form_captures')
    .select('id', { count: 'exact', head: true })
    .eq('domain', domain)
    .eq('structure_hash', structureHash);

  const captures = reporterCount ?? 1;
  const mergedFields = mergeTemplateFields(
    (existingTpl?.fields as FormTemplateField[]) || [],
    fields,
  );
  const status = captures >= QUORUM_CAPTURES ? 'active' : 'draft';
  const confidence = Math.min(1, captures / 5);

  const upsertPayload = {
    domain,
    path_pattern: path,
    structure_hash: structureHash,
    fields: mergedFields,
    capture_count: captures,
    status,
    confidence,
    updated_at: new Date().toISOString(),
  };

  if (templateId) {
    const { error: updErr } = await sb
      .from('domain_form_templates')
      .update(upsertPayload)
      .eq('id', templateId);
    if (updErr) {
      return corsResponse({ error: updErr.message }, { status: 500 });
    }
  } else {
    const { data: inserted, error: insErr } = await sb
      .from('domain_form_templates')
      .insert(upsertPayload)
      .select('id')
      .single();
    if (insErr) {
      return corsResponse({ error: insErr.message }, { status: 500 });
    }
    templateId = inserted.id;
    await sb
      .from('domain_form_captures')
      .update({ template_id: templateId })
      .eq('domain', domain)
      .eq('structure_hash', structureHash)
      .eq('reporter_hash', reporterHash);
  }

  return corsResponse({
    ok: true,
    template_id: templateId,
    structure_hash: structureHash,
    capture_count: captures,
    status,
    quorum: QUORUM_CAPTURES,
  });
}

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { isExtAuthed } from '@/lib/extension/auth';
import { corsPreflight, corsResponse } from '@/lib/extension/cors';
import type { FormTemplateRow } from '@/lib/extension/form-template';
import { normalizeDomain } from '@/lib/extension/form-template';

export const runtime = 'nodejs';

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * GET /api/extension/form-template?domain=&structure_hash=
 * Returns the best matching shared skeleton for a custom career form.
 */
export async function GET(req: NextRequest) {
  const auth = await isExtAuthed(req);
  if (!auth) {
    return corsResponse({ error: 'unauthorized' }, { status: 401 });
  }

  const domain = normalizeDomain(req.nextUrl.searchParams.get('domain') || '');
  const structureHash = req.nextUrl.searchParams.get('structure_hash') || '';
  if (!domain || !structureHash) {
    return corsResponse({ error: 'domain and structure_hash required' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('domain_form_templates')
    .select(
      'id, domain, path_pattern, structure_hash, status, confidence, fields, capture_count',
    )
    .eq('domain', domain)
    .eq('structure_hash', structureHash)
    .order('confidence', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return corsResponse({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return corsResponse({ ok: true, template: null });
  }

  const template: FormTemplateRow = {
    id: data.id,
    domain: data.domain,
    path_pattern: data.path_pattern,
    structure_hash: data.structure_hash,
    status: data.status,
    confidence: data.confidence ?? 0,
    fields: Array.isArray(data.fields) ? data.fields : [],
  };

  return corsResponse({
    ok: true,
    template,
    capture_count: data.capture_count ?? 0,
  });
}

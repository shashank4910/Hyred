import { NextRequest } from 'next/server';
import { isExtAuthed } from '@/lib/extension/auth';
import { corsPreflight, corsResponse } from '@/lib/extension/cors';
import type { AutofillProfile } from '@/lib/extension/profile';
import { mapAutofillFormFields, mapFormFieldsSemantic } from '@/lib/gemini';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/extension/map-fields
 * Body: { fields: {id,label,type}[], profile, job_title?, company? }
 *
 * Simplify-style semantic mapping for fields regex/Lever selectors missed.
 */
export async function POST(req: NextRequest) {
  const auth = await isExtAuthed(req);
  if (!auth) {
    return corsResponse({ error: 'unauthorized' }, { status: 401 });
  }

  let body: {
    mode?: 'semantic' | 'legacy';
    domain?: string;
    fields?:
      | { id: number; label: string; type: string }[]
      | {
          field_fp: string;
          label: string;
          widget_kind: string;
          options?: string[];
        }[];
    profile?: AutofillProfile;
    job_title?: string;
    company?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return corsResponse({ error: 'invalid body' }, { status: 400 });
  }

  if (!Array.isArray(body.fields) || body.fields.length === 0) {
    return corsResponse({ error: 'fields required' }, { status: 400 });
  }

  try {
    if (body.mode === 'semantic') {
      const semanticFields = body.fields as {
        field_fp: string;
        label: string;
        widget_kind: string;
        options?: string[];
      }[];
      const mappings = await mapFormFieldsSemantic({
        domain: body.domain || 'unknown',
        fields: semanticFields.slice(0, 35),
      });
      return corsResponse({ ok: true, mappings, mode: 'semantic' });
    }

    if (!body.profile) {
      return corsResponse({ error: 'profile required for legacy mode' }, { status: 400 });
    }

    const legacyFields = body.fields as { id: number; label: string; type: string }[];
    const mappings = await mapAutofillFormFields({
      fields: legacyFields.slice(0, 40),
      profile: body.profile,
      jobTitle: body.job_title,
      company: body.company,
    });
    return corsResponse({ ok: true, mappings, mode: 'legacy' });
  } catch (e) {
    return corsResponse(
      { error: `mapping failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}

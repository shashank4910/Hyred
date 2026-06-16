import { NextRequest } from 'next/server';
import { isExtAuthed } from '@/lib/extension/auth';
import { corsPreflight, corsResponse } from '@/lib/extension/cors';
import type { AutofillProfile } from '@/lib/extension/profile';
import { mapAutofillFormFields } from '@/lib/gemini';

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
    fields?: { id: number; label: string; type: string }[];
    profile?: AutofillProfile;
    job_title?: string;
    company?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return corsResponse({ error: 'invalid body' }, { status: 400 });
  }

  if (!Array.isArray(body.fields) || !body.profile) {
    return corsResponse({ error: 'fields and profile required' }, { status: 400 });
  }

  try {
    const mappings = await mapAutofillFormFields({
      fields: body.fields.slice(0, 30),
      profile: body.profile,
      jobTitle: body.job_title,
      company: body.company,
    });
    return corsResponse({ ok: true, mappings });
  } catch (e) {
    return corsResponse(
      { error: `mapping failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}

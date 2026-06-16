/**
 * POST /api/extension/exchange
 *
 * Accepts a Supabase access_token (obtained from the extension reading the
 * session cookie via chrome.cookies API) and exchanges it for a 90-day
 * extension JWT scoped to the user's profile.
 *
 * This is the primary auth flow for the extension when auto-connecting via
 * cookie reading. Unlike /api/extension/session, this doesn't rely on
 * cross-origin cookie delivery — the access_token is passed directly in the
 * request body.
 */
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { signExtensionToken } from '@/lib/extension/auth';
import { corsPreflight, corsResponse } from '@/lib/extension/cors';
import { buildAutofillProfile } from '@/lib/extension/profile';
import type { ResumeInsights } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function OPTIONS() {
  return corsPreflight();
}

export async function POST(req: NextRequest) {
  let body: { access_token?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return corsResponse({ error: 'invalid body' }, { status: 400 });
  }

  const accessToken = body.access_token?.trim();
  if (!accessToken) {
    return corsResponse({ error: 'access_token required' }, { status: 400 });
  }

  try {
    // Verify the access_token using Supabase Admin API.
    // This calls auth.getUser() with the token, which validates it server-side.
    const sb = supabaseAdmin();
    const {
      data: { user },
      error: userError,
    } = await sb.auth.getUser(accessToken);

    if (userError || !user) {
      return corsResponse(
        { error: userError?.message || 'invalid token' },
        { status: 401 },
      );
    }

    // Get the user's profile
    const { data: profile } = await sb
      .from('profiles')
      .select('id, email, full_name, resume_text, insights')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile) {
      return corsResponse(
        { error: 'no_profile_found' },
        { status: 404 },
      );
    }

    // Issue a user-specific JWT
    const token = await signExtensionToken(profile.id);

    // Build the autofill-shaped profile for the popup
    const { data: apply } = await sb
      .from('apply_profiles')
      .select('*')
      .eq('profile_id', profile.id)
      .maybeSingle();

    const autofillProfile = buildAutofillProfile(
      {
        email: profile.email,
        full_name: profile.full_name,
        resume_text: profile.resume_text,
        insights: (profile.insights as ResumeInsights | null) ?? null,
      },
      apply,
    );

    return corsResponse({
      ok: true,
      token,
      profile: autofillProfile,
    });
  } catch (e) {
    return corsResponse(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

/**
 * GET /api/extension/session
 *
 * Reads the Supabase Auth session cookie (sent automatically because the
 * extension popup is on the same browser) and exchanges it for a 90-day
 * extension JWT scoped to the authenticated user.
 *
 * This is the PRIMARY auth flow for the extension — no shared APP_PASSWORD
 * needed. The user just needs to be logged into hyred.in.
 *
 * If the user is not logged in, returns 401 and the extension falls back
 * to the APP_PASSWORD flow (/api/extension/auth).
 */
import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { signExtensionToken } from '@/lib/extension/auth';
import { corsPreflight, corsResponse } from '@/lib/extension/cors';
import { buildAutofillProfile } from '@/lib/extension/profile';
import type { ResumeInsights } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function OPTIONS() {
  return corsPreflight();
}

export async function GET(req: NextRequest) {
  try {
    // Read the Supabase session from cookies
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return corsResponse(
        { ok: false, error: 'not_authenticated' },
        { status: 401 },
      );
    }

    // Get the user's profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, full_name, resume_text, insights')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile) {
      return corsResponse(
        { ok: false, error: 'no_profile_found' },
        { status: 404 },
      );
    }

    // Issue a user-specific JWT
    const token = await signExtensionToken(profile.id);

    // Build the autofill-shaped profile for the popup
    const { data: apply } = await supabase
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

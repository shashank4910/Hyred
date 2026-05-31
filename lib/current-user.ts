import type { User } from '@supabase/supabase-js';
import { createServerSupabase, supabaseAdmin } from './supabase/server';
import type { Profile } from './types';

/**
 * Multi-user identity layer.
 *
 * The Supabase Auth user (auth.users) is the source of truth for WHO the
 * request is. Each auth user maps 1:1 to a row in `profiles` via
 * `profiles.user_id`. These helpers resolve the current user and their
 * profile, creating/linking the profile row lazily on first authenticated
 * request so onboarding "just works" right after sign-up.
 */

/** Returns the authenticated Supabase user, or null if not signed in. */
export async function getCurrentUser(): Promise<User | null> {
  const sb = await createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user ?? null;
}

/**
 * Resolve the profile row for the current authenticated user.
 *
 * Resolution order (uses the service-role client for the link/create so RLS
 * never blocks bootstrapping):
 *   1. profiles where user_id = auth user id        → return it
 *   2. legacy profile (user_id IS NULL) for ADMIN_EMAIL only → link once
 *   3. delete any other detached profile (user_id IS NULL) for this email
 *   4. create a fresh profile { user_id, email }
 *
 * Returns null only when there is no authenticated user.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return resolveProfileForUser(user);
}

/** Like getCurrentProfile but throws if unauthenticated (for route handlers). */
export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) {
    throw new Error('Not authenticated');
  }
  return profile;
}

/** Env bootstrap: does this email match the configured ADMIN_EMAIL? */
export function isAdminEmail(email: string | null | undefined): boolean {
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!admin || !email) return false;
  return email.trim().toLowerCase() === admin;
}

/**
 * Is the CURRENT request an admin? (gates the Admin nav, `/admin`, `/api/admin/*`).
 *
 * True if EITHER the signed-in email matches `ADMIN_EMAIL` (env bootstrap) OR
 * the user's `profiles.is_admin` flag is set (DB-driven, migration 0007). The
 * DB read is error-tolerant: if the `is_admin` column doesn't exist yet
 * (pre-0007) the query errors and we simply fall back to the env check, so
 * deploying this before the migration never breaks the app.
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (isAdminEmail(user.email)) return true;

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('profiles')
    .select('is_admin')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return false; // column missing (pre-migration) or query error → env-only
  return (data as { is_admin?: boolean } | null)?.is_admin === true;
}

const PROFILE_COLUMNS =
  'id, user_id, email, full_name, resume_text, resume_embedding, preferences, insights, created_at, updated_at';

async function resolveProfileForUser(user: User): Promise<Profile> {
  const sb = supabaseAdmin();
  const email = (user.email ?? '').toLowerCase();

  // 1. Already linked?
  const { data: linked } = await sb
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('user_id', user.id)
    .maybeSingle();
  if (linked) return linked as Profile;

  // 2. One-time legacy backfill: pre-multi-user row for the admin email only.
  if (email && isAdminEmail(email)) {
    const adopted = await adoptLegacyOrphanProfile(sb, email, user.id);
    if (adopted) return adopted;
  }

  // 3. Detached profile (user_id IS NULL) left by migration 0006 when an auth
  //    user was deleted. Wipe it so re-signup does NOT inherit old matches.
  //    (Migration 0008 switches auth delete to ON DELETE CASCADE instead.)
  if (email) {
    await sb.from('profiles').delete().ilike('email', email).is('user_id', null);
  }

  // 4. Create-or-adopt ATOMICALLY. Prefer user_id conflict target so concurrent
  //    first-login renders (prefetch + navigation) cannot hit idx_profiles_user_id.
  const insertEmail = user.email ?? `${user.id}@users.noreply`;
  const row = { user_id: user.id, email: insertEmail };

  const { data: byUserId, error: userIdError } = await sb
    .from('profiles')
    .upsert(row, { onConflict: 'user_id' })
    .select(PROFILE_COLUMNS)
    .single();
  if (!userIdError && byUserId) return byUserId as Profile;

  // Same email, different/null user_id (re-signup, legacy row) — re-point by
  // email BUT clear stale personal data so the new user starts fresh. The old
  // profile's resume, insights, and preferences belong to the prior account
  // and must NOT leak to the new user.
  const { data: byEmail, error: emailError } = await sb
    .from('profiles')
    .upsert(
      {
        ...row,
        full_name: null,
        resume_text: null,
        resume_embedding: null,
        insights: null,
        preferences: {},
      },
      { onConflict: 'email' },
    )
    .select(PROFILE_COLUMNS)
    .single();
  if (!emailError && byEmail) return byEmail as Profile;

  // Winner of a concurrent insert may commit after our upsert errors.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: reread } = await sb
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('user_id', user.id)
      .maybeSingle();
    if (reread) return reread as Profile;
    await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
  }

  const detail = userIdError?.message ?? emailError?.message ?? 'unknown error';
  throw new Error(`Failed to create profile for ${insertEmail}: ${detail}`);
}

/** Link a pre-multi-user orphan (user_id IS NULL) to this auth user. */
async function adoptLegacyOrphanProfile(
  sb: ReturnType<typeof supabaseAdmin>,
  email: string,
  userId: string,
): Promise<Profile | null> {
  const { data: existing } = await sb
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .ilike('email', email)
    .is('user_id', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!existing) return null;

  const { data: updated } = await sb
    .from('profiles')
    .update({ user_id: userId })
    .eq('id', existing.id)
    .is('user_id', null)
    .select(PROFILE_COLUMNS)
    .single();
  return (updated ?? existing) as Profile;
}

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
 *   2. legacy profile with matching email + null user_id → link it (backfill)
 *   3. otherwise create a fresh profile { user_id, email }
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

/** Is this user the app admin? (gates /admin). */
export function isAdminEmail(email: string | null | undefined): boolean {
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!admin || !email) return false;
  return email.trim().toLowerCase() === admin;
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

  // 2. A profile already exists for this (verified) email → adopt it by
  //    re-pointing user_id to this user. This covers BOTH the legacy
  //    null-user_id row AND a row owned by a different auth identity that
  //    happens to share the same email (e.g. email + Google sign-in to the
  //    same address), which would otherwise hit profiles_email_key on insert.
  if (email) {
    const adopted = await adoptProfileByEmail(sb, email, user.id);
    if (adopted) return adopted;
  }

  // 3. Create a fresh profile for this user. If a concurrent/duplicate row
  //    races us to the unique email, fall back to adopting it instead of
  //    crashing on profiles_email_key.
  const insertEmail = user.email ?? `${user.id}@users.noreply`;
  const { data: created, error } = await sb
    .from('profiles')
    .insert({ user_id: user.id, email: insertEmail })
    .select(PROFILE_COLUMNS)
    .single();
  if (!error && created) return created as Profile;

  const fallback = await adoptProfileByEmail(sb, insertEmail, user.id);
  if (fallback) return fallback;

  throw new Error(`Failed to create profile: ${error?.message ?? 'unknown error'}`);
}

/**
 * Adopt the profile matching `email` (case-insensitive) for `userId`.
 *
 * Returns the existing row unchanged if it is already owned by this user,
 * otherwise re-points its `user_id` to this user and returns the updated row.
 * Returns null when no profile with that email exists. Uses the oldest row
 * (order by created_at) so adoption is deterministic if duplicates exist.
 */
async function adoptProfileByEmail(
  sb: ReturnType<typeof supabaseAdmin>,
  email: string,
  userId: string,
): Promise<Profile | null> {
  const { data: existing } = await sb
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .ilike('email', email)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!existing) return null;

  const profile = existing as Profile;
  if (profile.user_id === userId) return profile;

  const { data: updated } = await sb
    .from('profiles')
    .update({ user_id: userId })
    .eq('id', profile.id)
    .select(PROFILE_COLUMNS)
    .single();
  return (updated ?? profile) as Profile;
}

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

  // 2. Legacy profile with same email and no user_id yet → adopt it.
  if (email) {
    const { data: legacy } = await sb
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .ilike('email', email)
      .is('user_id', null)
      .maybeSingle();
    if (legacy) {
      const { data: updated } = await sb
        .from('profiles')
        .update({ user_id: user.id })
        .eq('id', (legacy as Profile).id)
        .select(PROFILE_COLUMNS)
        .single();
      return (updated ?? legacy) as Profile;
    }
  }

  // 3. Create a fresh profile for this user.
  const { data: created, error } = await sb
    .from('profiles')
    .insert({ user_id: user.id, email: user.email ?? `${user.id}@users.noreply` })
    .select(PROFILE_COLUMNS)
    .single();
  if (error) {
    throw new Error(`Failed to create profile: ${error.message}`);
  }
  return created as Profile;
}

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from './admin';

export { supabaseAdmin } from './admin';

/**
 * Cookie-bound server client (anon key) tied to the current user's Supabase
 * Auth session. Use this to resolve WHO the request is (auth.getUser()).
 * Subject to RLS. Must be called from a Server Component, Route Handler, or
 * Server Action where next/headers cookies() is available.
 */
export async function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars',
    );
  }
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // setAll called from a Server Component — safe to ignore because the
          // middleware is responsible for refreshing the session cookie.
        }
      },
    },
  });
}

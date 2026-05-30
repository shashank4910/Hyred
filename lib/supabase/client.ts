'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client (anon key) with cookie-based session storage so the
 * session is shared with the server via @supabase/ssr. Use for auth actions
 * (sign in / sign up / OAuth / sign out) from client components.
 */
export const supabaseBrowser = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

import { AppShell } from './_components/AppShell';
import { supabaseAdmin } from '@/lib/supabase/server';

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = supabaseAdmin();
  const { data: profile } = await sb
    .from('profiles')
    .select('email, full_name, insights')
    .order('created_at')
    .limit(1)
    .maybeSingle();

  return (
    <AppShell
      profile={
        profile
          ? {
              email: profile.email,
              full_name: profile.full_name,
            }
          : null
      }
    >
      {children}
    </AppShell>
  );
}

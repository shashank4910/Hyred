import { AppShell } from './_components/AppShell';
import { getCurrentProfile, isAdminEmail } from '@/lib/current-user';

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  const isAdmin = isAdminEmail(profile?.email);

  return (
    <AppShell
      isAdmin={isAdmin}
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

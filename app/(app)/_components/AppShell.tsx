'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import {
  LayoutDashboard,
  BarChart3,
  LogOut,
  Zap,
  Link2,
  Shield,
  FileText,
  Settings,
  Building2,
} from 'lucide-react';
import { dismissAllAppToasts } from '@/lib/toast-app';
import { supabaseBrowser } from '@/lib/supabase/client';
import { HeaderSearch } from './HeaderSearch';
import { RunIngestButton } from './RunIngestButton';

const NAV: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  premium?: boolean;
  admin?: boolean;
  desktopOnly?: boolean;
}[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/onboarding', label: 'My Resume', icon: FileText },
  { href: '/stats', label: 'Stats', icon: BarChart3 },
  { href: '/top-mnc', label: 'Top MNCs', icon: Building2, premium: true },
  { href: '/apply-profile', label: 'Settings', icon: Settings },
  { href: '/import', label: 'Import', icon: Link2, desktopOnly: true },
  { href: '/admin', label: 'Admin', icon: Shield, admin: true },
];

export function AppShell({
  children,
  profile,
  isAdmin = false,
}: {
  children: React.ReactNode;
  profile: { email: string; full_name: string | null } | null;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const nav = NAV.filter((item) => !item.admin || isAdmin);

  async function logout() {
    dismissAllAppToasts();
    await supabaseBrowser.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : profile?.email?.slice(0, 2).toUpperCase() ?? 'HY';

  return (
    <div className="min-h-screen text-on-surface">
      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-50 hidden h-screen w-sidebar flex-col gap-y-6 bg-surface-container-lowest px-4 py-8 shadow-glass lg:flex">
        <Brand />

        <nav className="flex-1 space-y-1">
          {nav
            .filter((item) => !item.desktopOnly)
            .map(({ href, label, icon: Icon, premium }) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch={href === '/stats' ? false : undefined}
                  className={[
                    'flex items-center gap-3 rounded-2xl px-4 py-3 text-label-md font-semibold transition-all',
                    active
                      ? 'bg-primary-container text-on-primary-container shadow-card'
                      : premium
                        ? 'text-secondary hover:bg-surface-container-low'
                        : 'text-on-surface-variant hover:bg-surface-container-low',
                  ].join(' ')}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {label}
                </Link>
              );
            })}
        </nav>

        <div className="border-t border-outline-variant/30 pt-4">
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-label-md font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            <LogOut className="h-5 w-5" />
            Log out
          </button>
        </div>
      </aside>

      {/* Top header — above sidebar so scan source picker is not clipped */}
      <header className="fixed top-0 z-[60] flex h-20 w-full items-center justify-between gap-4 overflow-visible border-b border-outline-variant/20 bg-surface/80 px-4 backdrop-blur-md lg:pl-[calc(theme(spacing.sidebar)+24px)] lg:pr-6">
        <div className="flex items-center gap-3 lg:hidden">
          <Brand compact />
        </div>

        <Suspense fallback={<div className="hidden flex-1 lg:block" />}>
          <HeaderSearch />
        </Suspense>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <div className="hidden sm:block">
            <RunIngestButton isAdmin={isAdmin} luminous />
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-surface bg-surface-container-high text-xs font-bold text-primary shadow-sm">
            {initials}
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-outline-variant/30 bg-surface-container-lowest/95 px-2 py-2 backdrop-blur-md lg:hidden">
        {nav.slice(0, 5).map(({ href, label, icon: Icon, premium }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex flex-col items-center justify-center gap-0.5 rounded-xl p-2 transition-all',
                active
                  ? premium
                    ? 'bg-secondary-container/30 text-secondary'
                    : 'bg-primary-container/20 text-primary'
                  : 'text-on-surface-variant',
              ].join(' ')}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-semibold tracking-wide">{label.split(' ')[0]}</span>
            </Link>
          );
        })}
      </nav>

      <main className="mx-auto w-full max-w-page px-4 pb-24 pt-24 sm:px-6 lg:pl-[calc(theme(spacing.sidebar)+24px)] lg:pb-12 lg:pr-6">
        {children}
      </main>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={`flex items-center gap-3 ${compact ? '' : 'mb-2 px-2'}`}>
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl teal-gradient text-on-primary shadow-primary-glow">
        <Zap className="h-5 w-5 fill-current" />
      </span>
      {!compact && (
        <div>
          <div className="text-headline-md font-bold leading-tight text-primary">Hyred</div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">
            AI Career Engine
          </div>
        </div>
      )}
    </Link>
  );
}

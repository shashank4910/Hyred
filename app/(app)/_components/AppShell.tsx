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
  Search,
  BellRing,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { dismissAllAppToasts } from '@/lib/toast-app';
import { supabaseBrowser } from '@/lib/supabase/client';
import { HeaderSearch } from './HeaderSearch';
import { RunIngestButton } from './RunIngestButton';
import {
  usePreviewFocusMode,
  togglePreviewFocusMode,
} from '@/app/_components/ats-report/preview-focus';

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
  { href: '/dream-alerts', label: 'Dream Alerts', icon: BellRing },
  { href: '/ats-checker', label: 'ATS Checker', icon: Search },
  { href: '/top-mnc', label: 'Top MNCs', icon: Building2, premium: true },
  { href: '/settings', label: 'Settings', icon: Settings },
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
  const previewFocus = usePreviewFocusMode();
  const onAtsChecker = pathname.startsWith('/ats-checker');

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

  const onDashboard = pathname === '/';
  const hideSidebar = previewFocus || onDashboard;

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <aside
        className={`fixed left-0 top-0 z-40 h-screen w-[260px] flex-col gap-y-6 bg-surface-container-lowest px-4 py-8 shadow-glass transition-transform duration-200 ${
          hideSidebar ? 'lg:hidden' : 'hidden lg:flex'
        }`}
      >
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
            className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-label-md font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            <LogOut className="h-5 w-5" />
            Log out
          </button>
        </div>
      </aside>

      <header
        className={`fixed top-0 z-[60] flex h-20 w-full items-center justify-between gap-4 overflow-visible border-b border-outline-variant/20 bg-white px-4 lg:px-8 ${
          onDashboard || hideSidebar ? '' : 'lg:pl-[284px]'
        }`}
      >
        <div className={`flex items-center gap-3 ${onDashboard ? '' : 'lg:hidden'}`}>
          <Brand compact wordmark={onDashboard} />
        </div>
        {onDashboard && (
          <nav className="hidden items-center gap-8 text-sm font-semibold text-on-surface-variant lg:flex">
            {nav
              .filter((item) => !item.desktopOnly && !item.admin)
              .slice(0, 5)
              .map(({ href, label }) => {
                const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={active ? 'relative text-ink' : 'hover:text-ink'}
                  >
                    {label}
                    {active && (
                      <span className="absolute -bottom-2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary" />
                    )}
                  </Link>
                );
              })}
          </nav>
        )}

        {hideSidebar && !onDashboard && (
          <button
            type="button"
            onClick={togglePreviewFocusMode}
            className="hidden cursor-pointer items-center gap-2 rounded-xl border border-outline-variant/50 px-3 py-2 text-xs font-semibold text-on-surface-variant transition-colors hover:border-primary/30 hover:text-primary lg:inline-flex"
            title="Show menu"
          >
            <PanelLeft className="h-4 w-4" />
            Menu
          </button>
        )}

        {!hideSidebar && onAtsChecker && (
          <button
            type="button"
            onClick={togglePreviewFocusMode}
            className="hidden cursor-pointer items-center gap-2 rounded-xl border border-outline-variant/50 px-3 py-2 text-xs font-semibold text-on-surface-variant transition-colors hover:border-primary/30 hover:text-primary lg:inline-flex"
            title="Hide menu for more preview space"
          >
            <PanelLeftClose className="h-4 w-4" />
            Focus previews
          </button>
        )}

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

      <nav className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-outline-variant/30 bg-surface-container-lowest/95 px-2 py-2 backdrop-blur-md lg:hidden">
        {nav.slice(0, 7).map(({ href, label, icon: Icon, premium }) => {
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

      <main
        className={`relative z-0 mx-auto w-full min-w-0 px-4 pb-24 pt-24 sm:px-6 lg:pb-12 lg:pr-8 ${
          onDashboard
            ? 'max-w-[1440px] lg:pl-8'
            : hideSidebar
              ? 'max-w-[1600px] lg:pl-4'
              : 'max-w-page lg:pl-[284px]'
        }`}
      >
        {children}
      </main>
    </div>
  );
}

function Brand({ compact = false, wordmark = false }: { compact?: boolean; wordmark?: boolean }) {
  return (
    <Link href="/" className={`flex items-center gap-3 ${compact && !wordmark ? '' : wordmark ? '' : 'mb-2 px-2'}`}>
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-on-primary shadow-primary-glow">
        <Zap className="h-5 w-5 fill-current" />
      </span>
      {(wordmark || !compact) && (
        <div>
          <div className="text-xl font-extrabold leading-tight tracking-tight text-ink">Hyred</div>
          {!wordmark && (
            <div className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60">
              AI Career Engine
            </div>
          )}
        </div>
      )}
    </Link>
  );
}

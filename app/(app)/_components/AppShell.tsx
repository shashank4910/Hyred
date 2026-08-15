'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
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
  UserRound,
  Maximize2,
  Minimize2,
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
  short: string;
  icon: typeof LayoutDashboard;
  premium?: boolean;
  admin?: boolean;
}[] = [
  { href: '/', label: 'Dashboard', short: 'Jobs', icon: LayoutDashboard },
  { href: '/onboarding', label: 'My Resume', short: 'Resume', icon: FileText },
  { href: '/apply-profile', label: 'Apply profile', short: 'Apply', icon: UserRound },
  { href: '/stats', label: 'Stats', short: 'Stats', icon: BarChart3 },
  { href: '/dream-alerts', label: 'Dream Alerts', short: 'Alerts', icon: BellRing },
  { href: '/ats-checker', label: 'ATS Checker', short: 'ATS', icon: Search },
  { href: '/top-mnc', label: 'Top MNCs', short: 'MNCs', icon: Building2, premium: true },
  { href: '/import', label: 'Import', short: 'Import', icon: Link2 },
  { href: '/settings', label: 'Settings', short: 'Settings', icon: Settings },
  { href: '/admin', label: 'Admin', short: 'Admin', icon: Shield, admin: true },
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const nav = NAV.filter((item) => !item.admin || isAdmin);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

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

  function isActive(href: string) {
    return href === '/' ? pathname === '/' : pathname.startsWith(href);
  }

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <header className="fixed inset-x-3 top-3 z-[60] flex items-center gap-3 rounded-full bg-white px-3 py-2 shadow-card sm:inset-x-6 sm:px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 pl-1">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary">
            <Zap className="h-4 w-4 fill-current" />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-ink">Hyred</span>
        </Link>

        {!previewFocus && (
          <nav
            className="hidden min-w-0 flex-1 lg:block"
            aria-label="App"
          >
            <div className="mx-auto flex max-w-full items-center justify-center gap-0.5 overflow-x-auto rounded-full bg-surface-card p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {nav.map(({ href, label }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    prefetch={href === '/stats' ? false : undefined}
                    className={[
                      'whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors',
                      active
                        ? 'bg-lime-brand text-ink shadow-sm'
                        : 'text-on-surface-variant hover:text-ink',
                    ].join(' ')}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}

        {onAtsChecker && (
          <button
            type="button"
            onClick={togglePreviewFocusMode}
            className="hidden shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-on-surface-variant hover:bg-surface-card hover:text-ink lg:inline-flex"
            title={previewFocus ? 'Show menu' : 'Hide menu for more preview space'}
          >
            {previewFocus ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {previewFocus ? 'Menu' : 'Focus'}
          </button>
        )}

        <Suspense fallback={null}>
          <HeaderSearch />
        </Suspense>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="hidden sm:block">
            <RunIngestButton isAdmin={isAdmin} luminous />
          </div>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="Account menu"
            >
              {initials}
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+8px)] w-56 rounded-2xl bg-white p-2 shadow-elevated"
              >
                <p className="truncate px-3 py-2 text-xs text-on-surface-variant">
                  {profile?.email}
                </p>
                <Link
                  href="/settings"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-card"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
                <Link
                  href="/apply-profile"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-card"
                >
                  <UserRound className="h-4 w-4" />
                  Apply profile
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={logout}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-card"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav
        className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-1 overflow-x-auto rounded-full bg-white p-1.5 shadow-elevated [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"
        aria-label="App"
      >
        {nav.map(({ href, short, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex min-w-[3.5rem] flex-1 flex-col items-center gap-0.5 rounded-full px-2 py-2 text-[10px] font-semibold',
                active ? 'bg-lime-brand text-ink' : 'text-on-surface-variant',
              ].join(' ')}
            >
              <Icon className="h-4 w-4" />
              {short}
            </Link>
          );
        })}
      </nav>

      <main className="relative z-0 mx-auto w-full min-w-0 max-w-[1440px] px-4 pb-28 pt-24 sm:px-6 lg:px-8 lg:pb-12">
        {children}
      </main>
    </div>
  );
}

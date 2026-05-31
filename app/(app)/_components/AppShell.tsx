'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard,
  User,
  BarChart3,
  LogOut,
  Menu,
  X,
  Radar,
  Link2,
  Rocket,
  Crown,
  Shield,
} from 'lucide-react';
import { dismissAllAppToasts } from '@/lib/toast-app';
import { supabaseBrowser } from '@/lib/supabase/client';

const NAV: { href: string; label: string; icon: typeof LayoutDashboard; premium?: boolean; admin?: boolean }[] = [
  { href: '/', label: 'Matches', icon: LayoutDashboard },
  { href: '/top-mnc', label: 'Top MNC Hiring', icon: Crown, premium: true },
  { href: '/import', label: 'Import', icon: Link2 },
  { href: '/onboarding', label: 'Resume', icon: User },
  { href: '/apply-profile', label: 'Apply Profile', icon: Rocket },
  { href: '/stats', label: 'Stats', icon: BarChart3 },
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
  const [mobileOpen, setMobileOpen] = useState(false);

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
    : profile?.email?.slice(0, 2).toUpperCase() ?? 'JR';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Sticky top header — glass effect */}
      <header className="sticky top-0 z-50 flex justify-between items-center px-4 md:px-6 w-full h-16 bg-surface/80 backdrop-blur-md border-b border-border-muted">
        <Brand />

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {nav.map(({ href, label, icon: Icon, premium }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                prefetch={href === '/stats' ? false : undefined}
                className={[
                  'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  active
                    ? premium
                      ? 'text-secondary bg-secondary-fixed/50'
                      : 'text-primary bg-primary-fixed/50'
                    : premium
                      ? 'text-secondary hover:text-secondary hover:bg-secondary-fixed/30'
                      : 'text-on-surface-variant hover:text-primary hover:bg-primary-fixed/30',
                ].join(' ')}
              >
                <Icon className={`h-4 w-4 ${active ? (premium ? 'text-secondary' : 'text-primary') : premium ? 'text-secondary' : ''}`} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Right side: sign out + avatar */}
        <div className="flex items-center gap-3">
          <button
            onClick={logout}
            className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-on-surface-variant hover:text-primary border border-border-muted rounded-lg hover:bg-primary-fixed/30 transition-all"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
          <div className="w-9 h-9 rounded-full bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed-variant text-xs font-bold border-2 border-surface">
            {initials}
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-2 py-2 bg-surface/95 backdrop-blur-md border-t border-border-muted">
        {nav.map(({ href, label, icon: Icon, premium }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex flex-col items-center justify-center gap-0.5 p-2 rounded-xl transition-all',
                active
                  ? premium
                    ? 'bg-secondary-fixed text-secondary'
                    : 'bg-primary-fixed text-primary'
                  : premium
                    ? 'text-secondary'
                    : 'text-on-surface-variant',
              ].join(' ')}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium tracking-wide">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Main content */}
      <main className="flex-1 px-4 sm:px-6 py-6 pb-24 md:pb-6 max-w-page w-full mx-auto">
        {children}
      </main>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-primary font-bold">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary-fixed">
        <Radar className="h-4.5 w-4.5 text-primary" />
      </span>
      <span className="text-lg font-extrabold font-headline tracking-tight">Hyred</span>
    </Link>
  );
}

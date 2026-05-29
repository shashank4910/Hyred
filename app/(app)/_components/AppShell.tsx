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
} from 'lucide-react';
import { toast } from 'sonner';

const NAV = [
  { href: '/', label: 'Matches', icon: LayoutDashboard },
  { href: '/import', label: 'Import', icon: Link2 },
  { href: '/onboarding', label: 'Resume', icon: User },
  { href: '/apply-profile', label: 'Apply Profile', icon: Rocket },
  { href: '/stats', label: 'Stats', icon: BarChart3 },
];

export function AppShell({
  children,
  profile,
}: {
  children: React.ReactNode;
  profile: { email: string; full_name: string | null } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function logout() {
    await fetch('/api/login', { method: 'DELETE' });
    toast.success('Signed out');
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
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  active
                    ? 'text-primary bg-primary-fixed/50'
                    : 'text-on-surface-variant hover:text-primary hover:bg-primary-fixed/30',
                ].join(' ')}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-primary' : ''}`} />
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
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex flex-col items-center justify-center gap-0.5 p-2 rounded-xl transition-all',
                active
                  ? 'bg-primary-fixed text-primary'
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
      <span className="text-lg font-extrabold font-headline tracking-tight">JobRadar</span>
    </Link>
  );
}

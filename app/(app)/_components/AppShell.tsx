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
  { href: '/import', label: 'Import URL', icon: Link2 },
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

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 flex-col border-r border-border bg-pearl p-5">
        <Brand />
        <Nav pathname={pathname} />
        <div className="mt-auto pt-4 border-t border-border">
          {profile && (
            <div className="text-xs">
              <div className="font-semibold text-ink truncate">
                {profile.full_name ?? profile.email}
              </div>
              <div className="text-stone truncate">{profile.email}</div>
            </div>
          )}
          <button
            onClick={logout}
            className="mt-3 inline-flex items-center gap-2 text-xs text-stone hover:text-amber-hover transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 border-b border-border bg-pearl/90 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <Brand small />
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="p-2 -mr-2 text-stone hover:text-ink"
            aria-label="Menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileOpen && (
          <div className="border-t border-border px-2 py-2 bg-pearl">
            <Nav
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
            <button
              onClick={logout}
              className="w-full text-left mt-2 px-3 py-2 text-sm text-stone hover:text-amber-hover"
            >
              Sign out
            </button>
          </div>
        )}
      </div>

      {/* Main */}
      <main className="flex-1 px-4 sm:px-8 py-6 pt-20 md:pt-6 max-w-5xl w-full mx-auto">
        {children}
      </main>
    </div>
  );
}

function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link
      href="/"
      className={`flex items-center gap-2.5 ${small ? '' : 'mb-6'} text-ink font-bold`}
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-btn bg-amber/15">
        <Radar className="h-4.5 w-4.5 text-amber" />
      </span>
      <span className="text-body font-semibold tracking-tight">JobRadar</span>
    </Link>
  );
}

function Nav({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={
              active
                ? 'inline-flex items-center gap-2.5 rounded-btn bg-amber/10 text-ink px-3 py-2 text-sm font-medium border border-amber/20'
                : 'inline-flex items-center gap-2.5 rounded-btn px-3 py-2 text-sm text-stone hover:text-ink hover:bg-off-white transition-colors'
            }
          >
            <Icon className={`h-4 w-4 ${active ? 'text-amber' : ''}`} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

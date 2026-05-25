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
} from 'lucide-react';
import { toast } from 'sonner';

const NAV = [
  { href: '/', label: 'Matches', icon: LayoutDashboard },
  { href: '/import', label: 'Import URL', icon: Link2 },
  { href: '/onboarding', label: 'Profile', icon: User },
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
      <aside className="hidden md:flex md:w-60 flex-col border-r border-border bg-surface/40 p-4">
        <Brand />
        <Nav pathname={pathname} />
        <div className="mt-auto pt-4 border-t border-border">
          {profile && (
            <div className="text-xs">
              <div className="font-medium truncate">
                {profile.full_name ?? profile.email}
              </div>
              <div className="text-muted truncate">{profile.email}</div>
            </div>
          )}
          <button
            onClick={logout}
            className="mt-3 inline-flex items-center gap-2 text-xs text-muted hover:text-primary"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 border-b border-border bg-bg/80 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <Brand small />
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="p-2 -mr-2 text-muted hover:text-primary"
            aria-label="Menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileOpen && (
          <div className="border-t border-border px-2 py-2">
            <Nav
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
            <button
              onClick={logout}
              className="w-full text-left mt-2 px-3 py-2 text-sm text-muted hover:text-primary"
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
      className={`flex items-center gap-2 ${small ? '' : 'mb-6'} text-primary font-bold`}
    >
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/15">
        <Radar className="h-4 w-4" />
      </span>
      <span className="text-base">JobRadar</span>
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
                ? 'inline-flex items-center gap-2 rounded-md bg-primary/10 text-primary px-3 py-2 text-sm font-medium'
                : 'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted hover:text-fg hover:bg-surface'
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

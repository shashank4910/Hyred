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
  { href: '/import', label: 'Import', icon: Link2 },
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
      <aside className="hidden md:flex md:w-[240px] flex-col border-r border-faded-stone bg-pearl">
        <div className="p-6 pb-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-btn border border-faded-stone">
              <Radar className="h-3.5 w-3.5 text-ink" strokeWidth={2.25} />
            </span>
            <span className="text-body font-semibold text-ink tracking-tight">JobRadar</span>
          </Link>
        </div>

        <nav className="flex-1 px-3 space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 rounded-btn px-3 py-2 text-body-sm transition-colors ${
                  active
                    ? 'bg-off-white text-ink font-medium'
                    : 'text-stone hover:text-ink hover:bg-off-white'
                }`}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-faded-stone">
          {profile && (
            <div className="mb-3">
              <div className="text-body-sm font-medium text-ink truncate">
                {profile.full_name ?? profile.email}
              </div>
              <div className="text-caption text-stone truncate">{profile.email}</div>
            </div>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-2 text-caption text-stone hover:text-ink transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 border-b border-faded-stone bg-pearl">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Radar className="h-4 w-4 text-ink" strokeWidth={2.25} />
            <span className="text-body-sm font-semibold text-ink">JobRadar</span>
          </Link>
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="p-2 -mr-2 text-stone hover:text-ink"
            aria-label="Menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileOpen && (
          <nav className="border-t border-faded-stone px-3 py-2 bg-pearl space-y-0.5">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 rounded-btn px-3 py-2 text-body-sm ${
                    active ? 'bg-off-white text-ink font-medium' : 'text-stone'
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  {label}
                </Link>
              );
            })}
            <button
              onClick={logout}
              className="w-full text-left px-3 py-2 text-body-sm text-stone hover:text-ink"
            >
              Sign out
            </button>
          </nav>
        )}
      </div>

      {/* Main content */}
      <main className="flex-1 pt-16 md:pt-0">
        <div className="max-w-page mx-auto px-6 sm:px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

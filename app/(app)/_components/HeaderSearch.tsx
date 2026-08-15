'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';

/** Global match search — shown in the app header on the dashboard. */
export function HeaderSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setQ(sp.get('q') ?? '');
  }, [sp]);

  useEffect(() => {
    if (pathname !== '/') return;
    const id = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      if (q) params.set('q', q);
      else params.delete('q');
      startTransition(() => {
        router.replace(`/?${params.toString()}`, { scroll: false });
      });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, pathname]);

  if (pathname !== '/') return null;

  return (
    <div className="relative w-full max-w-[220px] shrink-0">
      <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search roles, companies, or keywords..."
        aria-busy={isPending}
        className={`w-full rounded-full border-0 bg-surface-card py-2 pl-11 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant outline-none transition-all focus:ring-2 focus:ring-primary/20 ${isPending ? 'opacity-70' : ''}`}
      />
    </div>
  );
}

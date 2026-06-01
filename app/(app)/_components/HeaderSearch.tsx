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

  if (pathname !== '/') {
    return <div className="hidden flex-1 lg:block" aria-hidden />;
  }

  return (
    <div className="relative flex-1 max-w-xl">
      <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search roles, companies, or keywords..."
        aria-busy={isPending}
        className={`w-full rounded-2xl border border-outline-variant bg-surface-container-lowest py-3 pl-11 pr-4 text-body-md text-on-surface placeholder:text-text-muted outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/15 ${isPending ? 'opacity-70' : ''}`}
      />
    </div>
  );
}

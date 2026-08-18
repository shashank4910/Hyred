'use client';

import { useState } from 'react';
import {
  companyInitial,
  companyLogoFallbackUrl,
  companyLogoUrl,
} from '@/lib/company-logo';

/**
 * Company logo tile — small rounded square with the brand favicon, matching
 * how LinkedIn/Indeed render company marks on job cards.
 *
 * Source chain (all keyless, free infra only):
 *   1. Google s2 favicon service (best coverage + size control)
 *   2. DuckDuckGo icons endpoint (second attempt on load error)
 *   3. Deterministic initial-letter monogram tile
 */
export function CompanyLogo({
  name,
  size = 20,
  tileClassName = '',
}: {
  name: string | null | undefined;
  size?: number;
  tileClassName?: string;
}) {
  // 0 = google, 1 = duckduckgo, 2 = give up → monogram
  const [source, setSource] = useState(0);
  if (!name) return null;

  const url =
    source === 0 ? companyLogoUrl(name, size) : source === 1 ? companyLogoFallbackUrl(name) : null;

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-container-lowest ring-1 ring-outline-variant/40 ${tileClassName}`}
      style={{ width: size, height: size }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- external keyless favicon service
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setSource((s) => Math.min(s + 1, 2))}
          className="h-full w-full object-contain p-0.5"
        />
      ) : (
        <span
          className="font-bold leading-none text-on-surface-variant select-none"
          style={{ fontSize: Math.max(10, Math.round(size * 0.5)) }}
        >
          {companyInitial(name)}
        </span>
      )}
    </span>
  );
}

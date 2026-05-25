import Link from 'next/link';

const ORDER = [
  'new',
  'saved',
  'applied',
  'interviewing',
  'offer',
  'rejected',
  'closed',
];

export function StatusFilter({
  counts,
  active,
}: {
  counts: Record<string, number>;
  active: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ORDER.map((s) => {
        const isActive = s === active;
        return (
          <Link
            key={s}
            href={`/?status=${s}`}
            className={
              isActive
                ? 'inline-flex items-center gap-1.5 rounded-full bg-primary text-bg px-3 py-1 text-xs font-semibold'
                : 'inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-primary hover:border-primary/40'
            }
          >
            <span className="capitalize">{s}</span>
            <span className={isActive ? 'opacity-70' : ''}>{counts[s] ?? 0}</span>
          </Link>
        );
      })}
    </div>
  );
}

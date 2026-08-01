'use client';

function ringColor(score: number): string {
  if (score >= 80) return '#10b981';
  if (score >= 55) return '#f59e0b';
  return '#ef4444';
}

/** Circular ATS score gauge — matches Fix Studio mockup. */
export function AtsScoreRing({
  score,
  size = 88,
  stroke = 8,
  label = '/100',
  className = '',
}: {
  score: number;
  size?: number;
  stroke?: number;
  label?: string;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = c - (clamped / 100) * c;
  const color = ringColor(clamped);

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`ATS score ${clamped} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-surface-container"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold tabular-nums leading-none text-on-surface">{clamped}</span>
        <span className="mt-0.5 text-[10px] font-semibold text-text-muted">{label}</span>
      </div>
    </div>
  );
}

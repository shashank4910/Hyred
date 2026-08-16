const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Snapshot card positions before a reorder. */
export function captureMatchRects(root: HTMLElement | null): Map<string, DOMRect> {
  const map = new Map<string, DOMRect>();
  if (!root) return map;
  root.querySelectorAll<HTMLElement>('[data-match-id]').forEach((el) => {
    const id = el.dataset.matchId;
    if (id) map.set(id, el.getBoundingClientRect());
  });
  return map;
}

/** Slide cards from their old grid slots into the new order. */
export function playMatchFlip(root: HTMLElement | null, first: Map<string, DOMRect> | null): void {
  if (!root || !first || first.size === 0 || prefersReducedMotion()) return;

  root.querySelectorAll<HTMLElement>('[data-match-id]').forEach((el) => {
    const id = el.dataset.matchId;
    if (!id) return;
    const prev = first.get(id);
    if (!prev) return;
    const last = el.getBoundingClientRect();
    const dx = prev.left - last.left;
    const dy = prev.top - last.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

    el.getAnimations().forEach((a) => a.cancel());
    el.style.zIndex = '2';
    const anim = el.animate(
      [
        {
          transform: `translate(${dx}px, ${dy}px) scale(0.97)`,
          filter: 'brightness(0.98)',
          boxShadow: '0 12px 28px rgba(17, 17, 17, 0.14)',
        },
        {
          transform: 'none',
          filter: 'none',
          boxShadow: '0 1px 2px rgba(17, 17, 17, 0.06), 0 10px 28px rgba(17, 17, 17, 0.08)',
        },
      ],
      { duration: 420, easing: EASE, fill: 'both' },
    );
    anim.finished
      .catch(() => undefined)
      .finally(() => {
        el.style.zIndex = '';
      });
  });
}

'use client';

import { useEffect, useState } from 'react';

type Listener = (active: boolean) => void;

let scanUiActive = false;
const listeners = new Set<Listener>();

/** Tell the dashboard empty state a scan toast is on screen. */
export function setScanUiActive(active: boolean) {
  if (scanUiActive === active) return;
  scanUiActive = active;
  listeners.forEach((l) => l(active));
}

export function useScanUiActive(): boolean {
  const [active, setActive] = useState(scanUiActive);
  useEffect(() => {
    const listener: Listener = (next) => setActive(next);
    listeners.add(listener);
    setActive(scanUiActive);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return active;
}

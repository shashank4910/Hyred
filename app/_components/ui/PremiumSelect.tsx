'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import './PremiumSelect.css';

export type PremiumSelectOption = { value: string; label: string };
export type PremiumSelectGroup = { label: string; options: PremiumSelectOption[] };

type PremiumSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options?: PremiumSelectOption[];
  groups?: PremiumSelectGroup[];
  variant?: 'forest' | 'surface';
  compact?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  'aria-label'?: string;
};

type FlatRow =
  | { kind: 'group'; label: string }
  | { kind: 'option'; value: string; label: string; index: number };

export default function PremiumSelect({
  value,
  onChange,
  options = [],
  groups = [],
  variant = 'surface',
  compact = false,
  disabled = false,
  className = '',
  id,
  name,
  placeholder = 'Select',
  'aria-label': ariaLabel,
}: PremiumSelectProps) {
  const autoId = useId();
  const listId = `${autoId}-list`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(0);
  const [menuBox, setMenuBox] = useState({ top: 0, left: 0, width: 0 });
  const typeRef = useRef({ buf: '', at: 0 });

  const flat = useMemo(() => {
    const rows: FlatRow[] = [];
    let i = 0;
    for (const o of options) {
      rows.push({ kind: 'option', value: o.value, label: o.label, index: i++ });
    }
    for (const g of groups) {
      rows.push({ kind: 'group', label: g.label });
      for (const o of g.options) {
        rows.push({ kind: 'option', value: o.value, label: o.label, index: i++ });
      }
    }
    return rows;
  }, [options, groups]);

  const optionRows = useMemo(
    () => flat.filter((r): r is Extract<FlatRow, { kind: 'option' }> => r.kind === 'option'),
    [flat],
  );

  const selected = optionRows.find((o) => o.value === value);
  const selectedLabel = selected?.label ?? '';

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const i = optionRows.findIndex((o) => o.value === value);
    setActive(i >= 0 ? i : 0);
    requestAnimationFrame(() => menuRef.current?.focus());
  }, [open, optionRows, value]);



  useEffect(() => {
    if (!open) return;
    const place = (e?: Event) => {
      // Skip scroll events that originate from inside the menu —
      // those are the user scrolling the option list, not the page.
      if (e && e.type === 'scroll' && menuRef.current?.contains(e.target as Node)) return;
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.max(r.width, compact ? 140 : 180);
      const maxH = 280;
      const gap = 6;
      const below = window.innerHeight - r.bottom - 12;
      const openUp = below < maxH && r.top > below;
      const top = openUp ? Math.max(8, r.top - maxH - gap) : r.bottom + gap;
      const left = Math.min(r.left, window.innerWidth - width - 8);
      setMenuBox((prev) => {
        if (prev.top === top && prev.left === left && prev.width === width) return prev;
        return { top, left, width };
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, compact]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function commit(i: number) {
    const row = optionRows[i];
    if (!row) return;
    onChange(row.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onTriggerKey(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  }

  function scrollActiveIntoView(nextActive: number) {
    requestAnimationFrame(() => {
      const el = menuRef.current?.querySelector('[data-active="true"]');
      el?.scrollIntoView({ block: 'nearest' });
    });
  }

  function onMenuKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((n) => {
        const next = Math.min(optionRows.length - 1, n + 1);
        scrollActiveIntoView(next);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((n) => {
        const next = Math.max(0, n - 1);
        scrollActiveIntoView(next);
        return next;
      });
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
      scrollActiveIntoView(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(optionRows.length - 1);
      scrollActiveIntoView(optionRows.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commit(active);
    } else if (e.key.length === 1) {
      const now = Date.now();
      if (now - typeRef.current.at > 700) typeRef.current.buf = '';
      typeRef.current.buf += e.key.toLowerCase();
      typeRef.current.at = now;
      const hit = optionRows.findIndex((o) =>
        o.label.toLowerCase().startsWith(typeRef.current.buf),
      );
      if (hit >= 0) setActive(hit);
    }
  }

  const rootClass = [
    'hyred-select',
    `hyred-select--${variant}`,
    compact ? 'hyred-select--compact' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const menu =
    mounted && open
      ? createPortal(
          <div
            ref={menuRef}
            className="hyred-select__menu"
            style={{
              position: 'fixed',
              top: menuBox.top,
              left: menuBox.left,
              width: menuBox.width,
            }}
            tabIndex={-1}
            onKeyDown={onMenuKey}
          >
            <ul id={listId} role="listbox" className="hyred-select__list" tabIndex={-1}>
              {flat.map((row, i) =>
                row.kind === 'group' ? (
                  <li key={`g-${i}`} className="hyred-select__group-label" aria-hidden="true">
                    {row.label}
                  </li>
                ) : (
                  <li key={row.value === '' ? `empty-${row.index}` : row.value} role="presentation">
                    <button
                      type="button"
                      role="option"
                      id={`${autoId}-opt-${row.index}`}
                      aria-selected={row.value === value}
                      data-selected={row.value === value ? 'true' : 'false'}
                      data-active={row.index === active ? 'true' : 'false'}
                      className="hyred-select__option"
                      onMouseEnter={() => setActive(row.index)}
                      onClick={() => commit(row.index)}
                    >
                      <span>{row.label}</span>
                      {row.value === value ? (
                        <Check className="hyred-select__check" strokeWidth={2.5} />
                      ) : null}
                    </button>
                  </li>
                ),
              )}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={rootClass}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className="hyred-select__trigger"
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
      >
        <span className={`hyred-select__value${selected ? '' : ' is-placeholder'}`}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown className="hyred-select__chevron" aria-hidden="true" />
      </button>
      {menu}
    </div>
  );
}

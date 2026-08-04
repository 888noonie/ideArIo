import { useState, useRef, useEffect, useCallback } from 'react';

export interface ListSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface ListSelectProps {
  value: string;
  options: ListSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  loading?: boolean;
  error?: string | null;
  ariaLabel: string;
}

/**
 * Inline replacement for the native <select> — the AA/Fermata host display
 * server crashes on native select popups (roadtest CRITICAL). Frozen
 * contract F1: the option list expands INLINE below the trigger in normal
 * flow (no portal, no position:fixed, no focus trap, no scroll hijack),
 * activates on click only, and closes on selection or outside pointerdown.
 */
export function ListSelect({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  loading = false,
  error = null,
  ariaLabel,
}: ListSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Close on outside pointerdown (single document listener, cleaned up).
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  // On open, scroll the currently-selected option into view (A2 safety valve).
  useEffect(() => {
    if (!open || !listRef.current) return;
    const selected = listRef.current.querySelector('[aria-selected="true"]');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [open]);

  const handleSelect = useCallback(
    (option: ListSelectOption) => {
      if (option.disabled) return;
      onChange(option.value);
      setOpen(false);
    },
    [onChange]
  );

  const selected = options.find((o) => o.value === value);
  const triggerLabel = loading
    ? 'Loading…'
    : selected
      ? selected.label
      : placeholder;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`w-full min-h-14 px-4 rounded-2xl bg-ario-card text-base text-left
                   border border-white/10 flex items-center justify-between gap-3
                   transition-colors focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50
                   ${selected ? 'text-ario-text' : 'text-ario-muted/70'}`}
      >
        <span className="truncate">{triggerLabel}</span>
        <svg
          className={`w-5 h-5 flex-none text-ario-muted transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel}
          className="max-h-60 overflow-y-auto chat-scroll mt-2 rounded-2xl bg-ario-card
                     border border-white/10 divide-y divide-white/5"
        >
          {error !== null && error !== '' && (
            <li
              role="option"
              aria-selected="false"
              aria-disabled="true"
              className="min-h-12 px-4 flex items-center text-sm text-ario-red/90"
            >
              {error}
            </li>
          )}
          {!loading && !error && options.length === 0 && (
            <li
              role="option"
              aria-selected="false"
              aria-disabled="true"
              className="min-h-12 px-4 flex items-center text-sm text-ario-muted/70"
            >
              No options available.
            </li>
          )}
          {loading && options.length === 0 && (
            <li
              role="option"
              aria-selected="false"
              aria-disabled="true"
              className="min-h-12 px-4 flex items-center text-sm text-ario-muted"
            >
              Loading…
            </li>
          )}
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                onClick={() => handleSelect(option)}
                className={`min-h-12 px-4 flex items-center justify-between gap-3 text-sm
                           transition-colors cursor-pointer
                           ${option.disabled
                             ? 'text-ario-muted/40 cursor-not-allowed'
                             : isSelected
                               ? 'bg-ario-turquoise/10 text-ario-turquoise font-medium'
                               : 'text-ario-text active:bg-white/10'}`}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && (
                  <svg
                    className="w-4 h-4 flex-none"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

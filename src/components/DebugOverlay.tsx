import { useState, useEffect, useCallback } from 'react';

interface DebugOverlayProps {
  onClose: () => void;
}

interface TouchTargetReport {
  total: number;
  failing: number;
  offenders: string[];
}

const MIN_TOUCH = 72;

function aspectRatio(w: number, h: number): string {
  if (w <= 0 || h <= 0) return '—';
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(w, h);
  const rw = w / d;
  const rh = h / d;
  // Keep it readable (e.g. 2560×960 -> 8:3)
  if (rw > 40 || rh > 40) return `${(w / h).toFixed(2)}:1`;
  return `${rw}:${rh}`;
}

function runTouchTargetCheck(): TouchTargetReport {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>('button, [role="button"], a, input, textarea, select')
  );

  let total = 0;
  const offenders: string[] = [];

  for (const el of elements) {
    if (el.closest('[data-debug-overlay]')) continue; // skip the overlay itself
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue; // hidden
    total += 1;
    if (rect.width < MIN_TOUCH || rect.height < MIN_TOUCH) {
      const label =
        el.getAttribute('aria-label') ||
        el.textContent?.trim().slice(0, 24) ||
        el.tagName.toLowerCase();
      offenders.push(`${label} (${Math.round(rect.width)}×${Math.round(rect.height)})`);
    }
  }

  return { total, failing: offenders.length, offenders: offenders.slice(0, 6) };
}

/**
 * Toggleable debug overlay for Tucson touchscreen validation:
 * viewport resolution, aspect ratio, and a ≥72px touch-target audit.
 */
export function DebugOverlay({ onClose }: DebugOverlayProps) {
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [report, setReport] = useState<TouchTargetReport | null>(null);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const runCheck = useCallback(() => {
    setReport(runTouchTargetCheck());
  }, []);

  const dpr = window.devicePixelRatio || 1;

  return (
    <div
      data-debug-overlay
      className="fixed bottom-20 right-4 z-50 w-80 rounded-2xl bg-black/85 border border-ario-turquoise/30
                    p-4 font-mono text-xs text-ario-text shadow-2xl backdrop-blur-sm"
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-ario-turquoise font-semibold uppercase tracking-wider">Debug</p>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-2 rounded-lg bg-white/10 text-ario-text hover:bg-white/20"
          aria-label="Close debug overlay"
        >
          ✕
        </button>
      </div>

      <dl className="space-y-1">
        <div className="flex justify-between">
          <dt className="text-ario-muted">Viewport</dt>
          <dd>{viewport.w} × {viewport.h} CSS px</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ario-muted">Physical</dt>
          <dd>{Math.round(viewport.w * dpr)} × {Math.round(viewport.h * dpr)} px</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ario-muted">DPR</dt>
          <dd>{dpr}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ario-muted">Aspect</dt>
          <dd>{aspectRatio(viewport.w, viewport.h)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ario-muted">Touch</dt>
          <dd>{'ontouchstart' in window ? 'yes' : 'no'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ario-muted">Speech API</dt>
          <dd>{('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) ? 'yes' : 'no'}</dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={runCheck}
        className="mt-3 w-full py-3 rounded-xl bg-ario-turquoise/15 border border-ario-turquoise/40
                   text-ario-turquoise font-semibold hover:bg-ario-turquoise/25"
      >
        Run touch-target check
      </button>

      {report && (
        <div className="mt-3">
          <p className={report.failing === 0 ? 'text-ario-turquoise' : 'text-ario-red'}>
            {report.failing === 0
              ? `✓ All ${report.total} targets ≥ ${MIN_TOUCH}px`
              : `✗ ${report.failing}/${report.total} targets < ${MIN_TOUCH}px`}
          </p>
          {report.offenders.length > 0 && (
            <ul className="mt-2 space-y-1 text-ario-muted">
              {report.offenders.map((o) => (
                <li key={o} className="truncate">• {o}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

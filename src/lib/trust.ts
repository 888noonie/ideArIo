/**
 * Trust spine: how much autonomy the crew has, and how loudly it may
 * interrupt. Trust (suggest / co_pilot / autonomous) is NOT urgency
 * (whisper / tap / alert) — the config keeps both plus a sliding-window
 * rate limiter so the crew never speaks unaddressed more than the cap.
 */

export type TrustState = 'suggest' | 'co_pilot' | 'autonomous';
export type Urgency = 'whisper' | 'tap' | 'alert';

export interface TrustConfig {
  trust: TrustState;
  urgencyCap: Urgency;
  rateLimitPerMin: number;
}

export const DEFAULT_TRUST: TrustConfig = {
  trust: 'suggest',
  urgencyCap: 'tap',
  rateLimitPerMin: 1,
};

const TRUST_KEY = 'ideario-trust';
const SUGGEST_LOG_KEY = 'ideario-suggest-log';
const WINDOW_MS = 60_000;

const TRUST_STATES: TrustState[] = ['suggest', 'co_pilot', 'autonomous'];
const URGENCIES: Urgency[] = ['whisper', 'tap', 'alert'];

export function loadTrust(): TrustConfig {
  try {
    const raw = window.localStorage.getItem(TRUST_KEY);
    if (!raw) return { ...DEFAULT_TRUST };
    const parsed = JSON.parse(raw) as Partial<TrustConfig>;
    return {
      trust: TRUST_STATES.includes(parsed.trust as TrustState)
        ? (parsed.trust as TrustState)
        : DEFAULT_TRUST.trust,
      urgencyCap: URGENCIES.includes(parsed.urgencyCap as Urgency)
        ? (parsed.urgencyCap as Urgency)
        : DEFAULT_TRUST.urgencyCap,
      rateLimitPerMin:
        typeof parsed.rateLimitPerMin === 'number' && parsed.rateLimitPerMin > 0
          ? parsed.rateLimitPerMin
          : DEFAULT_TRUST.rateLimitPerMin,
    };
  } catch {
    return { ...DEFAULT_TRUST };
  }
}

export function saveTrust(c: TrustConfig): void {
  try {
    window.localStorage.setItem(TRUST_KEY, JSON.stringify(c));
  } catch {
    // storage unavailable — fail silently
  }
}

/** Read the suggestion log, pruning entries older than the 60s window. */
function readLog(now: number): number[] {
  try {
    const raw = window.localStorage.getItem(SUGGEST_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as number[]).filter(
      (ts) => typeof ts === 'number' && now - ts < WINDOW_MS
    );
  } catch {
    return [];
  }
}

function writeLog(timestamps: number[]): void {
  try {
    window.localStorage.setItem(SUGGEST_LOG_KEY, JSON.stringify(timestamps));
  } catch {
    // storage unavailable — fail silently
  }
}

/**
 * Sliding-window rate limit: true when fewer than rateLimitPerMin
 * suggestions happened in the last 60 seconds. The window is pruned on
 * every call so the log never grows unbounded.
 */
export function canSuggest(): boolean {
  const now = Date.now();
  const windowed = readLog(now);
  writeLog(windowed); // persist the pruned window
  return windowed.length < loadTrust().rateLimitPerMin;
}

/** Record that the crew just made an unprompted suggestion. */
export function recordSuggestion(): void {
  const now = Date.now();
  const windowed = readLog(now);
  windowed.push(now);
  writeLog(windowed);
}

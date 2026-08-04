import { useMemo, useState } from 'react';
import { loadChatLog, type ChatEntry } from '../lib/chat-engine';
import type { SavedIdeario } from '../types/ideario';

interface HistoryTabProps {
  savedIdeas: SavedIdeario[];
}

type DisplayMode = 'compact' | 'comfortable';

const DISPLAY_MODE_KEY = 'ideario-display-mode';

function loadDisplayMode(): DisplayMode {
  try {
    const stored = window.localStorage.getItem(DISPLAY_MODE_KEY);
    if (stored === 'compact' || stored === 'comfortable') return stored;
  } catch {
    // storage unavailable — fall through to default
  }
  return 'comfortable';
}

function saveDisplayMode(mode: DisplayMode): void {
  try {
    window.localStorage.setItem(DISPLAY_MODE_KEY, mode);
  } catch {
    // storage unavailable — fail silently
  }
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function dayLabel(key: string): string {
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function entrySpeaker(entry: ChatEntry): string {
  if (entry.role === 'user') return 'You';
  if (entry.role === 'system') return 'System';
  return entry.agentName ?? 'Agent';
}

/**
 * History tab: the persisted chat log (`ideario-chat-log`) grouped by day
 * in collapsible containers (header = date + entry count), plus a
 * collapsible saved-ideas section showing the existing Gist sync state
 * ("Synced" / "Local only", A5). Display-mode toggle (compact/comfortable)
 * persists in `ideario-display-mode` (F3); expand animation respects
 * prefers-reduced-motion via the `.history-expand` rule in index.css.
 */
export function HistoryTab({ savedIdeas }: HistoryTabProps) {
  const [mode, setMode] = useState<DisplayMode>(loadDisplayMode);
  // Loaded on mount — the tab is remounted each time it is opened, so this
  // is always the current log.
  const [entries] = useState<ChatEntry[]>(loadChatLog);

  const days = useMemo(() => {
    const byDay = new Map<string, ChatEntry[]>();
    for (const entry of entries) {
      const key = dayKey(entry.ts);
      const list = byDay.get(key);
      if (list) {
        list.push(entry);
      } else {
        byDay.set(key, [entry]);
      }
    }
    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, list]) => ({ key, list }));
  }, [entries]);

  // Most recent day starts expanded.
  const [openDays, setOpenDays] = useState<Set<string>>(
    () => new Set(days.length > 0 ? [days[0].key] : [])
  );
  const [ideasOpen, setIdeasOpen] = useState(false);

  const toggleDay = (key: string) => {
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const changeMode = (next: DisplayMode) => {
    setMode(next);
    saveDisplayMode(next);
  };

  const compact = mode === 'compact';
  const rowPad = compact ? 'py-1' : 'py-2.5';
  const rowText = compact ? 'text-xs' : 'text-sm';
  const headText = compact ? 'text-sm' : 'text-base';

  return (
    <div className="h-full flex flex-col min-h-0 p-4 gap-3">
      {/* Header + display-mode toggle */}
      <div className="flex-none flex items-center justify-between gap-3">
        <h2 className={`${headText} font-semibold text-ario-text`}>History</h2>
        <div
          className="flex rounded-2xl border border-white/10 overflow-hidden"
          role="group"
          aria-label="Display density"
        >
          {(['compact', 'comfortable'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => changeMode(m)}
              aria-pressed={mode === m}
              className={`min-h-12 px-4 text-xs font-medium capitalize transition-colors
                         focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ario-turquoise/50
                         ${mode === m
                           ? 'bg-ario-turquoise/15 text-ario-turquoise'
                           : 'bg-ario-card text-ario-muted hover:text-ario-text'}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto chat-scroll flex flex-col gap-2 pr-1">
        {/* Chat log grouped by day */}
        {days.length === 0 ? (
          <p className="text-ario-muted text-sm text-center py-6">
            No chat history yet — talk to your crew in the Voice Chat tab.
          </p>
        ) : (
          days.map(({ key, list }) => {
            const open = openDays.has(key);
            return (
              <div
                key={key}
                className="flex-none rounded-2xl bg-ario-card border border-white/10 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleDay(key)}
                  aria-expanded={open}
                  className="w-full min-h-14 px-4 flex items-center justify-between gap-3 text-left
                             focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ario-turquoise/50"
                >
                  <span className={`${headText} text-ario-text font-medium`}>{dayLabel(key)}</span>
                  <span className="flex items-center gap-2 flex-none">
                    <span className="text-ario-muted text-xs">
                      {list.length} {list.length === 1 ? 'entry' : 'entries'}
                    </span>
                    <svg
                      className={`w-5 h-5 text-ario-muted transition-transform ${open ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </span>
                </button>
                {open && (
                  <div className="history-expand border-t border-white/5 px-4 pb-2">
                    {list.map((entry) => (
                      <div key={entry.id} className={`${rowPad} border-b border-white/5 last:border-b-0`}>
                        <p className="text-ario-muted text-xs mb-0.5">
                          {timeLabel(entry.ts)} · {entrySpeaker(entry)}
                          {entry.status === 'error' ? ' · failed' : ''}
                        </p>
                        <p className={`${rowText} text-ario-text leading-relaxed whitespace-pre-wrap break-words`}>
                          {entry.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Saved ideas + sync state (A5: the existing SavedIdeario.synced flag) */}
        <div className="flex-none rounded-2xl bg-ario-card border border-white/10 overflow-hidden">
          <button
            type="button"
            onClick={() => setIdeasOpen((prev) => !prev)}
            aria-expanded={ideasOpen}
            className="w-full min-h-14 px-4 flex items-center justify-between gap-3 text-left
                       focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ario-turquoise/50"
          >
            <span className={`${headText} text-ario-text font-medium`}>Saved ideas</span>
            <span className="flex items-center gap-2 flex-none">
              <span className="text-ario-muted text-xs">
                {savedIdeas.length} {savedIdeas.length === 1 ? 'idea' : 'ideas'}
              </span>
              <svg
                className={`w-5 h-5 text-ario-muted transition-transform ${ideasOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </span>
          </button>
          {ideasOpen && (
            <div className="history-expand border-t border-white/5 px-4 pb-2">
              {savedIdeas.length === 0 ? (
                <p className="text-ario-muted text-sm py-3">No saved ideas yet.</p>
              ) : (
                savedIdeas.map((idea) => (
                  <div
                    key={idea.id}
                    className={`${rowPad} border-b border-white/5 last:border-b-0 flex items-center justify-between gap-3`}
                  >
                    <span className={`${rowText} text-ario-text truncate flex-1 min-w-0`}>
                      {idea.title || 'Untitled note'}
                    </span>
                    <span
                      className={`flex-none text-xs px-2 py-1 rounded-full border
                                 ${idea.synced
                                   ? 'bg-ario-turquoise/10 text-ario-turquoise border-ario-turquoise/30'
                                   : 'bg-ario-grey/60 text-ario-muted border-white/10'}`}
                    >
                      {idea.synced ? 'Synced' : 'Local only'}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

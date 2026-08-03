import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatEntry } from '../lib/chat-engine';

interface ChatBubbleProps {
  entry: ChatEntry;
  /** Model label shown under the agent name, e.g. "openrouter/moonshotai/kimi-k2". */
  modelLabel?: string;
  /** Re-send the prompt that produced a failed entry. */
  onRetry?: (entry: ChatEntry) => void;
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * One chat message.
 * - user: right-aligned neutral bubble
 * - agent: left-aligned, 3px left border in the agent's color, name + model
 *   label above, timestamp below
 * - long messages collapse to ~4 lines with a fade and a "Tap to expand" toggle
 * - thinking = pulsing shimmer; error = warm red border + Retry
 */
export function ChatBubble({ entry, modelLabel, onRetry }: ChatBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const [collapsible, setCollapsible] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Detect overflow (> ~4 lines) once content is rendered, so the collapse
  // affordance only appears on genuinely long messages.
  useEffect(() => {
    const el = contentRef.current;
    if (!el || entry.status !== 'done') return;
    setCollapsible(el.scrollHeight > el.clientHeight + 2);
  }, [entry.content, entry.status]);

  const toggle = useCallback(() => {
    if (collapsible) setExpanded((prev) => !prev);
  }, [collapsible]);

  const isUser = entry.role === 'user';
  const time = formatTime(entry.ts);

  if (isUser) {
    return (
      <div className="flex justify-end px-4 py-1.5">
        <div className="max-w-[85%] sm:max-w-[70%]">
          <div className="rounded-3xl rounded-br-md bg-ario-card border border-white/10 px-5 py-3">
            <p className="text-ario-text text-base leading-relaxed whitespace-pre-wrap break-words"
               style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
              {entry.content}
            </p>
          </div>
          <p className="text-ario-muted/70 text-xs mt-1 text-right pr-2">{time}</p>
        </div>
      </div>
    );
  }

  const accent = entry.color ?? '#00f5d4';
  const isThinking = entry.status === 'thinking';
  const isError = entry.status === 'error';

  return (
    <div className="flex justify-start px-4 py-1.5">
      <div className="max-w-[90%] sm:max-w-[75%] min-w-0">
        <div
          className={`rounded-3xl rounded-bl-md bg-ario-grey border-y border-r px-5 py-3
                     ${isError ? 'border-ario-red/40' : 'border-white/5'}`}
          style={{ borderLeft: `3px solid ${isError ? 'rgb(var(--accent-secondary))' : accent}` }}
        >
          {/* Agent label */}
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full flex-none"
              style={{ backgroundColor: accent }}
              aria-hidden="true"
            />
            <span className="text-sm font-semibold text-ario-text truncate">
              {entry.agentName ?? 'Agent'}
            </span>
            {modelLabel && (
              <span className="text-xs text-ario-muted truncate">{modelLabel}</span>
            )}
          </div>

          {isThinking ? (
            <div className="chat-shimmer h-6 w-40 rounded-lg" aria-label="Thinking" />
          ) : (
            <div
              ref={contentRef}
              onClick={toggle}
              role={collapsible ? 'button' : undefined}
              aria-expanded={collapsible ? expanded : undefined}
              className={`relative ${collapsible && !expanded ? 'chat-collapsed cursor-pointer' : ''} ${collapsible ? 'cursor-pointer' : ''}`}
            >
              <p
                className={`text-base leading-relaxed whitespace-pre-wrap break-words
                           ${isError ? 'text-ario-red' : 'text-ario-text'}`}
                style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
              >
                {entry.content}
              </p>
              {collapsible && !expanded && <div className="chat-fade" aria-hidden="true" />}
            </div>
          )}

          {collapsible && !isThinking && (
            <button
              type="button"
              onClick={toggle}
              className="mt-1 text-xs font-medium text-ario-turquoise/90 hover:text-ario-turquoise
                         focus:outline-none focus:underline min-h-8"
            >
              {expanded ? 'Tap to collapse' : 'Tap to expand'}
            </button>
          )}

          {isError && onRetry && (
            <button
              type="button"
              onClick={() => onRetry(entry)}
              className="mt-2 min-h-14 px-5 rounded-2xl border border-ario-red/40 bg-ario-red/10
                         text-ario-text text-sm font-medium transition-colors
                         hover:border-ario-red/70 focus:outline-none focus:ring-2 focus:ring-ario-red/50"
            >
              Retry
            </button>
          )}
        </div>
        <p className="text-ario-muted/70 text-xs mt-1 pl-2">{time}</p>
      </div>
    </div>
  );
}

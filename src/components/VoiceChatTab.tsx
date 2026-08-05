import { ChatPanel } from './ChatPanel';
import type { AgentSpec } from '../lib/agents';
import type { ArioState } from '../types/ideario';

interface VoiceChatTabProps {
  agents: AgentSpec[];
  /** Paired mode: passed through to ChatPanel (bigger type, Queue-link buttons). */
  paired: boolean;
  parked: boolean;
  /** False while another tab is active (the tab stays mounted). */
  visible: boolean;
  // ---- voice bar state (owned by App's speech hooks) ----
  state: ArioState;
  transcript: string;
  interimTranscript: string;
  onActivate: () => void;
  speechSupported: boolean;
  wakeMode: boolean;
  wakePaused: boolean;
  onToggleWakeMode: () => void;
  cueText: string | null;
  ttsAvailable: boolean;
  /** Speak a reflex confirmation aloud (voice lane feedback). */
  onReflexResponse: (text: string) => void;
  /** Registration point: ChatPanel hands up its reflex-first send path. */
  onSendReady: (send: (text: string) => Promise<void>) => void;
}

const SILENT_MODE_COPY =
  'Voice feedback is quiet in this browser. Pair your phone in the Bridge tab and enable Crew audio there for spoken replies.';

function stateText(
  state: ArioState,
  speechSupported: boolean,
  wakeMode: boolean,
  wakePaused: boolean
): string {
  if (!speechSupported) return 'Voice input isn’t available in this browser — type below.';
  if (wakeMode) {
    return wakePaused ? 'Wake mode paused — tap the mic to resume.' : 'Listening for “Hey Ario”…';
  }
  switch (state) {
    case 'listening':
      return 'Listening — tap to stop.';
    case 'thinking':
      return 'Thinking…';
    case 'error':
      return 'Something went wrong — tap to try again.';
    default:
      return 'Tap the mic and talk to your crew.';
  }
}

/**
 * Unified Voice Chat tab (F4/F6): a compact, top-CENTERED voice bar above
 * the full multi-agent ChatPanel. Finalized voice transcripts flow into
 * ChatPanel's send path (reflex lane FIRST, then dispatch) exactly as if
 * typed — the legacy NIM/YAML capture pipeline is retired from the tab bar.
 */
export function VoiceChatTab({
  agents,
  paired,
  parked,
  visible,
  state,
  transcript,
  interimTranscript,
  onActivate,
  speechSupported,
  wakeMode,
  wakePaused,
  onToggleWakeMode,
  cueText,
  ttsAvailable,
  onReflexResponse,
  onSendReady,
}: VoiceChatTabProps) {
  const displayText = interimTranscript || transcript;
  const listening = state === 'listening' || (wakeMode && !wakePaused);

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Compact voice bar — mic pinned top-center (roadtest #1) */}
      <div className="flex-none px-4 pt-3 pb-2 border-b border-white/5 bg-ario-grey/70">
        <div className="relative flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={onActivate}
            disabled={state === 'thinking' || !speechSupported}
            className={`min-h-14 min-w-14 flex items-center justify-center rounded-full border
                       transition-all active:scale-95
                       focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50
                       disabled:opacity-40 disabled:cursor-not-allowed
                       ${listening
                         ? 'bg-ario-turquoise/25 border-ario-turquoise text-ario-turquoise shadow-[0_0_20px_rgba(0,245,212,0.35)]'
                         : 'bg-ario-card border-white/15 text-ario-text hover:border-ario-turquoise/50'}`}
            aria-label={listening ? 'Stop listening' : 'Start voice input'}
            aria-pressed={listening}
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </svg>
          </button>
          <p className="text-ario-muted text-xs leading-tight text-center">
            {stateText(state, speechSupported, wakeMode, wakePaused)}
          </p>
          {speechSupported && (
            <button
              type="button"
              onClick={onToggleWakeMode}
              className={`absolute right-0 top-0 min-h-12 px-3 rounded-2xl border text-xs font-medium
                         transition-colors focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50
                         ${wakeMode
                           ? 'bg-ario-turquoise/15 border-ario-turquoise/50 text-ario-turquoise'
                           : 'bg-ario-card border-white/10 text-ario-muted hover:border-ario-turquoise/30'}`}
              aria-pressed={wakeMode}
            >
              Hey Ario {wakeMode ? 'ON' : 'OFF'}
            </button>
          )}
        </div>

        {displayText && (
          <p className="mt-1.5 text-ario-text text-sm text-center truncate" aria-live="polite">
            {displayText}
          </p>
        )}

        {/* Silent-mode subtitle: honest fallback copy pointing at the Bridge
            tab's Crew audio (roadtest #3). */}
        {!ttsAvailable ? (
          <p className="mt-1.5 px-3 py-2 rounded-xl bg-ario-card/70 border border-ario-turquoise/20
                        text-ario-muted text-xs leading-snug text-center">
            {SILENT_MODE_COPY}
          </p>
        ) : (
          cueText && (
            <p className="mt-1.5 text-ario-muted text-xs leading-snug text-center truncate" aria-live="polite">
              {cueText}
            </p>
          )
        )}
      </div>

      {/* ChatPanel owns its own scroll container + auto-scroll (A3). */}
      <div className="flex-1 min-h-0">
        <ChatPanel
          agents={agents}
          paired={paired}
          parked={parked}
          visible={visible}
          onSendReady={onSendReady}
          onReflexResponse={onReflexResponse}
        />
      </div>
    </div>
  );
}

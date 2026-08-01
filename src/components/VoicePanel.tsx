import { ArioOrb } from './ArioOrb';
import { TextInputFallback } from './TextInputFallback';
import type { ArioState } from '../types/ideario';

export type InputMode = 'voice' | 'text';

interface VoicePanelProps {
  state: ArioState;
  transcript: string;
  interimTranscript: string;
  onActivate: () => void;
  onSave: () => void;
  onClear: () => void;
  canSave: boolean;
  inputMode: InputMode;
  onInputModeChange: (mode: InputMode) => void;
  onTextSubmit: (text: string) => void;
  speechSupported: boolean;
  wakeMode: boolean;
  wakePaused: boolean;
  onToggleWakeMode: () => void;
  cueText: string | null;
  ttsAvailable: boolean;
}

export function VoicePanel({
  state,
  transcript,
  interimTranscript,
  onActivate,
  onSave,
  onClear,
  canSave,
  inputMode,
  onInputModeChange,
  onTextSubmit,
  speechSupported,
  wakeMode,
  wakePaused,
  onToggleWakeMode,
  cueText,
  ttsAvailable,
}: VoicePanelProps) {
  const displayText = interimTranscript || transcript;

  return (
    <div className="ario-panel h-full flex flex-col p-6 overflow-y-auto">
      {/* Top brand */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ario-turquoise">IDEARIO</h1>
          <p className="text-ario-muted text-sm">Your noble co-pilot</p>
        </div>
        {speechSupported && inputMode === 'voice' && (
          <button
            type="button"
            onClick={onToggleWakeMode}
            className={`min-h-touch px-4 rounded-2xl border text-sm font-medium transition-colors
                       focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50
                       ${wakeMode
                         ? 'bg-ario-turquoise/15 border-ario-turquoise/50 text-ario-turquoise'
                         : 'bg-ario-card border-white/10 text-ario-muted hover:border-ario-turquoise/30'}`}
            aria-pressed={wakeMode}
          >
            Hey Ario {wakeMode ? 'ON' : 'OFF'}
          </button>
        )}
      </div>

      {/* Ario voice-feedback subtitle — always visual, so feedback still
          lands when the browser's TTS engine is missing or muted. */}
      {(cueText || !ttsAvailable) && (
        <div className="mb-4 px-4 py-3 rounded-2xl bg-ario-card/70 border border-ario-turquoise/20">
          <p className="text-ario-text text-lg leading-snug">
            {!ttsAvailable && (
              <span className="text-ario-muted">(silent mode) </span>
            )}
            {cueText ?? 'Voice feedback unavailable in this browser — watch here for responses.'}
          </p>
        </div>
      )}

      {inputMode === 'text' ? (
        <div className="flex-1 flex flex-col justify-center">
          {!speechSupported && (
            <p className="text-ario-muted text-sm mb-4 p-3 rounded-xl bg-ario-card/60 border border-white/5">
              Voice input isn't available in this browser — type your idea instead.
            </p>
          )}
          <TextInputFallback
            onSubmit={onTextSubmit}
            onCancel={() => speechSupported && onInputModeChange('voice')}
            busy={state === 'thinking'}
          />
        </div>
      ) : (
        <>
          {/* Orb */}
          <div className="flex-1 flex items-center justify-center">
            <ArioOrb
              state={state}
              onActivate={onActivate}
              disabled={state === 'thinking'}
              wakeMode={wakeMode}
              wakePaused={wakePaused}
            />
          </div>

          {/* Transcript */}
          <div className="mt-6 min-h-[80px] p-4 rounded-2xl bg-ario-card/50 border border-white/5">
            <p className="text-ario-muted text-xs uppercase tracking-wider mb-2">Transcript</p>
            <p className="text-ario-text text-lg leading-relaxed">
              {displayText || (
                <span className="text-ario-muted italic">
                  {wakeMode
                    ? wakePaused
                      ? 'Wake mode paused — tap the orb to resume.'
                      : "Listening for 'Hey Ario'..."
                    : 'Ario is listening for your idea...'}
                </span>
              )}
            </p>
          </div>
        </>
      )}

      {/* Quick actions */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="ario-button col-span-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0111.186 0z" />
          </svg>
          Save Idea
        </button>
        <button
          type="button"
          onClick={onClear}
          className="ario-button"
        >
          Clear
        </button>
        {inputMode === 'voice' ? (
          <button
            type="button"
            onClick={() => onInputModeChange('text')}
            className="ario-button"
          >
            Type instead
          </button>
        ) : (
          <button
            type="button"
            onClick={() => speechSupported && onInputModeChange('voice')}
            disabled={!speechSupported}
            className="ario-button disabled:opacity-40"
          >
            Voice mode
          </button>
        )}
      </div>
    </div>
  );
}

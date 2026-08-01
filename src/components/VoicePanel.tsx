import { ArioOrb } from './ArioOrb';
import type { ArioState } from '../types/ideario';

interface VoicePanelProps {
  state: ArioState;
  transcript: string;
  interimTranscript: string;
  onActivate: () => void;
  onSave: () => void;
  onClear: () => void;
  canSave: boolean;
}

export function VoicePanel({
  state,
  transcript,
  interimTranscript,
  onActivate,
  onSave,
  onClear,
  canSave,
}: VoicePanelProps) {
  const displayText = interimTranscript || transcript;
  const isActive = state === 'listening' || state === 'thinking';
  const helperText = state === 'thinking'
    ? 'Turning your thought into a structured idea…'
    : state === 'listening'
      ? 'Listening — speak naturally, then tap Stop.'
      : 'Tap the orb and speak your next idea.';

  return (
    <div className="ario-panel ario-panel-raised h-full flex flex-col p-6 overflow-y-auto">
      {/* Top brand */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ario-turquoise">IDEARIO</h1>
          <p className="text-ario-muted text-sm">Your noble co-pilot</p>
        </div>
        <span className={`ario-state-pill ${isActive ? 'ario-state-pill-active' : ''}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-ario-turquoise animate-pulse' : 'bg-ario-muted'}`} />
          {state === 'thinking' ? 'Working' : state === 'listening' ? 'Live' : 'Ready'}
        </span>
      </div>

      {/* Orb */}
      <div className="flex-1 min-h-[230px] flex flex-col items-center justify-center">
        <ArioOrb state={state} onActivate={onActivate} disabled={state === 'thinking'} />
        <p className="mt-3 text-center text-xs text-ario-muted" aria-live="polite">{helperText}</p>
      </div>

      {/* Transcript */}
      <div className={`mt-5 min-h-[96px] p-4 rounded-2xl border transition-colors ${
        isActive ? 'bg-ario-turquoise/5 border-ario-turquoise/25' : 'bg-ario-card/50 border-white/5'
      }`}>
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-ario-muted text-xs uppercase tracking-wider">Transcript</p>
          {interimTranscript && <span className="text-[10px] uppercase tracking-wider text-ario-turquoise">Live</span>}
        </div>
        <p className="text-ario-text text-base leading-relaxed" aria-live="polite">
          {displayText || <span className="text-ario-muted italic">Ario is listening for your idea...</span>}
        </p>
      </div>

      {/* Quick actions */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="ario-button ario-button-primary col-span-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0111.186 0z" />
          </svg>
          Save Idea
        </button>
        <button
          type="button"
          onClick={onClear}
          className="ario-button ario-button-quiet"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onActivate}
          disabled={state === 'thinking'}
          className="ario-button disabled:opacity-40"
        >
          {state === 'listening' ? 'Stop' : 'Speak'}
        </button>
      </div>
    </div>
  );
}

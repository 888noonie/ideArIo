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

  return (
    <div className="ario-panel h-full flex flex-col p-6">
      {/* Top brand */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-ario-turquoise">IDEARIO</h1>
        <p className="text-ario-muted text-sm">Your noble co-pilot</p>
      </div>

      {/* Orb */}
      <div className="flex-1 flex items-center justify-center">
        <ArioOrb state={state} onActivate={onActivate} disabled={state === 'thinking'} />
      </div>

      {/* Transcript */}
      <div className="mt-6 min-h-[80px] p-4 rounded-2xl bg-ario-card/50 border border-white/5">
        <p className="text-ario-muted text-xs uppercase tracking-wider mb-2">Transcript</p>
        <p className="text-ario-text text-lg leading-relaxed">
          {displayText || <span className="text-ario-muted italic">Ario is listening for your idea...</span>}
        </p>
      </div>

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

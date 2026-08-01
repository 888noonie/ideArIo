import type { ArioState } from '../types/ideario';

interface ArioOrbProps {
  state: ArioState;
  onActivate: () => void;
  disabled?: boolean;
}

const STATE_CONFIG: Record<ArioState, { label: string; color: string; ringClass: string }> = {
  idle: {
    label: 'Tap to speak',
    color: 'bg-ario-turquoise',
    ringClass: 'ario-orb-ring-turquoise-soft',
  },
  listening: {
    label: 'Listening...',
    color: 'bg-ario-turquoise',
    ringClass: 'ario-orb-ring-turquoise-strong',
  },
  thinking: {
    label: 'Thinking...',
    color: 'bg-ario-red',
    ringClass: 'ario-orb-ring-red',
  },
  speaking: {
    label: 'Speaking...',
    color: 'bg-ario-turquoise',
    ringClass: 'ario-orb-ring-turquoise',
  },
  error: {
    label: 'Try again',
    color: 'bg-ario-red',
    ringClass: 'ario-orb-ring-red-strong',
  },
};

export function ArioOrb({ state, onActivate, disabled = false }: ArioOrbProps) {
  const config = STATE_CONFIG[state];
  const isListening = state === 'listening';
  const isThinking = state === 'thinking';

  return (
    <button
      type="button"
      onClick={onActivate}
      disabled={disabled}
      className="relative flex flex-col items-center justify-center gap-4 group rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ario-turquoise focus-visible:ring-offset-8 focus-visible:ring-offset-ario-grey"
      aria-label={config.label}
    >
      {/* Outer pulsing ring */}
      <div
        className={`absolute inset-0 rounded-full transition-all duration-500 ${config.ringClass} ${
          isListening || isThinking ? 'animate-pulse-ring' : 'opacity-0 scale-75'
        }`}
      />

      {/* Orb */}
      <div
        className={`relative w-40 h-40 rounded-full ${config.color} flex items-center justify-center
                    shadow-[0_0_60px_rgba(0,245,212,0.3)] transition-all duration-300 ario-orb-core
                    group-active:scale-95 group-hover:shadow-[0_0_80px_rgba(0,245,212,0.45)]
                    ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {/* Inner gradient */}
        <div className="absolute inset-2 rounded-full bg-gradient-to-br from-white/20 to-transparent" />

        {/* Face / icon */}
        <svg
          className="relative z-10 w-16 h-16 text-ario-dark"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          {isListening ? (
            <>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </>
          ) : (
            <>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            </>
          )}
        </svg>
      </div>

      {/* State label */}
      <div className="text-center">
        <p className="text-ario-text text-lg font-medium">{config.label}</p>
        <p className="text-ario-muted text-sm">{isListening ? 'I’m with you' : isThinking ? 'Mapping the connections' : 'Ario is ready'}</p>
      </div>
    </button>
  );
}

import type { ArioState } from '../types/ideario';

interface ArioOrbProps {
  state: ArioState;
  onActivate: () => void;
  disabled?: boolean;
  /** Wake-word mode is armed — orb shows "Say 'Hey Ario'". */
  wakeMode?: boolean;
  /** Wake mode is temporarily paused (silence timeout). */
  wakePaused?: boolean;
}

const STATE_CONFIG: Record<ArioState, { label: string; color: string; ring: string }> = {
  idle: {
    label: 'Tap to speak',
    color: 'bg-ario-turquoise',
    ring: 'rgba(0, 245, 212, 0.4)',
  },
  listening: {
    label: 'Listening...',
    color: 'bg-ario-turquoise',
    ring: 'rgba(0, 245, 212, 0.8)',
  },
  thinking: {
    label: 'Thinking...',
    color: 'bg-ario-red',
    ring: 'rgba(255, 71, 87, 0.6)',
  },
  speaking: {
    label: 'Speaking...',
    color: 'bg-ario-turquoise',
    ring: 'rgba(0, 245, 212, 0.6)',
  },
  error: {
    label: 'Try again',
    color: 'bg-ario-red',
    ring: 'rgba(255, 71, 87, 0.8)',
  },
};

export function ArioOrb({ state, onActivate, disabled = false, wakeMode = false, wakePaused = false }: ArioOrbProps) {
  const config = STATE_CONFIG[state];
  const isListening = state === 'listening' || (wakeMode && !wakePaused && state === 'idle');
  const isThinking = state === 'thinking';

  const label = wakeMode
    ? wakePaused
      ? 'Wake mode paused — tap to resume'
      : state === 'idle'
        ? "Say 'Hey Ario'"
        : config.label
    : config.label;

  const subtitle = wakeMode
    ? wakePaused
      ? 'Ario is resting'
      : 'Hands-free mode is on'
    : 'Ario is ready';

  return (
    <button
      type="button"
      onClick={onActivate}
      disabled={disabled}
      className="relative flex flex-col items-center justify-center gap-4 group focus:outline-none"
      aria-label={label}
    >
      {/* Outer pulsing ring */}
      <div
        className={`absolute inset-0 rounded-full transition-all duration-500 ${
          isListening || isThinking ? 'animate-pulse-ring' : 'opacity-0 scale-75'
        }`}
        style={{ background: `radial-gradient(circle, ${config.ring} 0%, transparent 70%)` }}
      />

      {/* Orb */}
      <div
        className={`relative w-[clamp(96px,24vh,160px)] h-[clamp(96px,24vh,160px)] rounded-full ${config.color} flex items-center justify-center
                    shadow-[0_0_60px_rgba(0,245,212,0.3)] transition-all duration-300
                    group-active:scale-95 group-hover:shadow-[0_0_80px_rgba(0,245,212,0.45)]
                    ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
                    ${wakeMode && !wakePaused ? 'animate-glow' : ''}`}
      >
        {/* Inner gradient */}
        <div className="absolute inset-2 rounded-full bg-gradient-to-br from-white/20 to-transparent" />

        {/* Face / icon */}
        <svg
          className="relative z-10 w-[clamp(40px,10vh,64px)] h-[clamp(40px,10vh,64px)] text-ario-dark"
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

        {/* Wake-mode badge */}
        {wakeMode && (
          <div className="absolute -top-2 -right-2 px-3 py-1 rounded-full bg-ario-dark border border-ario-turquoise/40
                          text-ario-turquoise text-xs font-semibold uppercase tracking-wider">
            {wakePaused ? 'Paused' : 'Wake'}
          </div>
        )}
      </div>

      {/* State label */}
      <div className="text-center">
        <p className="text-ario-text text-lg font-medium">{label}</p>
        <p className="text-ario-muted text-sm">{subtitle}</p>
      </div>
    </button>
  );
}

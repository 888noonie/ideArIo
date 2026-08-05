import { } from 'react';

interface FirstRunConsentProps {
  onAcknowledge: () => void;
}

export function FirstRunConsent({ onAcknowledge }: FirstRunConsentProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="First run consent"
    >
      <div className="w-full max-w-md rounded-3xl bg-ario-grey border border-white/10 p-6 shadow-[0_0_60px_rgba(0,0,0,0.6)]">
        <h2 className="text-2xl font-semibold text-ario-text mb-3">Welcome to Ario</h2>
        <div className="space-y-3 text-ario-muted text-sm leading-relaxed">
          <p>Ario listens only after you say “Hey Ario.”</p>
          <p>Your keys and ideas stay in this browser, sent only to providers you choose.</p>
          <p>Tap the mic when you're ready to talk.</p>
          <p className="text-ario-text text-xs mt-3 border-t border-white/10 pt-3">
            Speech recognition uses your browser’s built-in service (on Chrome, Google’s).
            Everything else stays local unless you send it.
          </p>
        </div>
        <button
          type="button"
          onClick={onAcknowledge}
          className="mt-6 w-full min-h-14 rounded-2xl bg-ario-turquoise text-ario-bg font-semibold text-lg
                     hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

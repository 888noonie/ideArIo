import type { PendingAgentSync } from '../lib/settings-sync';

interface AgentSyncPromptProps {
  sync: PendingAgentSync;
  onAccept: () => void;
  onDecline: () => void;
}

/** Custom display-side confirmation for an incoming phone agent transfer. */
export function AgentSyncPrompt({ sync, onAccept, onDecline }: AgentSyncPromptProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      role="dialog"
      aria-modal="true"
      aria-label="Agent sync confirmation"
    >
      <div
        className="w-full max-w-md rounded-3xl bg-ario-grey border border-white/10 p-6
                   shadow-[0_0_60px_rgba(0,0,0,0.6)]"
      >
        <h3 className="text-2xl font-semibold text-ario-text">Sync agents?</h3>
        <p className="text-ario-muted text-sm mt-2">
          Phone wants to sync {sync.agents.length} {sync.agents.length === 1 ? 'agent' : 'agents'}.
          {sync.preserveDisplayAgents
            ? ' Display-only agents will be kept.'
            : ' Display-only agents will be removed.'}
        </p>
        <div className="flex flex-col gap-3 mt-6">
          <button
            type="button"
            onClick={onAccept}
            className="min-w-touch min-h-touch rounded-2xl bg-ario-turquoise text-ario-bg
                       font-semibold text-lg hover:brightness-110 focus:outline-none
                       focus:ring-2 focus:ring-ario-turquoise/50"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="min-w-touch min-h-touch rounded-2xl bg-ario-card text-ario-text
                       border border-white/10 font-semibold text-lg hover:border-ario-turquoise/40
                       focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

import type { SyncedSettings } from '../lib/settings-sync';

interface SettingsSyncPromptProps {
  settings: SyncedSettings;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * S-03: custom confirmation modal shown on the display when the hub wants to
 * sync settings (keys, agents, theme). Nothing is written until Accept.
 * Custom component — never a native popup (AA invariant).
 */
export function SettingsSyncPrompt({ settings, onAccept, onDecline }: SettingsSyncPromptProps) {
  const keyCount = Object.keys(settings.providerKeys ?? {}).length;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      role="dialog"
      aria-modal="true"
      aria-label="Settings sync confirmation"
    >
      <div
        className="w-full max-w-md rounded-3xl bg-ario-grey border border-white/10 p-6
                   shadow-[0_0_60px_rgba(0,0,0,0.6)]"
      >
        <h3 className="text-2xl font-semibold text-ario-text">Sync settings?</h3>
        <p className="text-ario-muted text-sm mt-2">
          Phone wants to sync settings{keyCount > 0 ? ` (${keyCount} provider key${keyCount === 1 ? '' : 's'}, agents, theme)` : ' (agents, theme)'}.
          Accept?
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

import { ModelSelector } from './ModelSelector';
import { ThemeSwitcher } from './ThemeSwitcher';
import type { ModelInfo } from '../lib/model-registry';
import type { Theme } from '../lib/theme';

interface StatusBarProps {
  online: boolean;
  synced: boolean;
  ideaCount: number;
  selectedModelId: string;
  onModelChange: (model: ModelInfo) => void;
  theme: Theme;
  onToggleTheme: () => void;
  onToggleDebug: () => void;
}

export function StatusBar({
  online,
  synced,
  ideaCount,
  selectedModelId,
  onModelChange,
  theme,
  onToggleTheme,
  onToggleDebug,
}: StatusBarProps) {
  return (
    <div className="flex items-center justify-between px-6 py-3 bg-ario-card/30 border-t border-white/5 gap-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${
              online ? 'bg-ario-turquoise animate-pulse' : 'bg-ario-red'
            }`}
          />
          <span className="text-ario-muted text-sm hidden sm:inline">
            {online ? 'Online' : 'Offline — saved locally'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-ario-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.745 3.745 0 013.296-1.043A3.745 3.745 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
          </svg>
          <span className="text-ario-muted text-sm hidden sm:inline">
            {synced ? 'Synced' : 'Unsaved changes'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-ario-muted text-sm hidden md:block">
          {ideaCount} {ideaCount === 1 ? 'idea' : 'ideas'} in vault
        </div>
        <ModelSelector selectedModelId={selectedModelId} onSelect={onModelChange} />
        <ThemeSwitcher theme={theme} onToggle={onToggleTheme} />
        <button
          type="button"
          onClick={onToggleDebug}
          className="min-h-touch min-w-touch hidden sm:flex items-center justify-center rounded-xl
                     bg-ario-card border border-white/10 text-ario-muted
                     hover:border-ario-turquoise/50 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
          aria-label="Toggle debug overlay"
          title="Debug overlay"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

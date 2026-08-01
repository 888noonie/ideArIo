import { ModelSelector } from './ModelSelector';
import type { ModelInfo } from '../lib/model-registry';

interface StatusBarProps {
  online: boolean;
  synced: boolean;
  ideaCount: number;
  selectedModelId: string;
  onModelChange: (model: ModelInfo) => void;
}

export function StatusBar({ online, synced, ideaCount, selectedModelId, onModelChange }: StatusBarProps) {
  return (
    <div className="flex items-center justify-between px-6 py-3 bg-ario-card/30 border-t border-white/5 gap-4 backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${
              online ? 'bg-ario-turquoise animate-pulse' : 'bg-ario-red'
            }`}
          />
          <span className="text-ario-muted text-sm hidden sm:inline" aria-live="polite">
            {online ? 'Online' : 'Offline — saved locally'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-ario-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.745 3.745 0 013.296-1.043A3.745 3.745 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
          </svg>
          <span className="text-ario-muted text-sm hidden sm:inline" aria-live="polite">
            {synced ? 'Synced' : 'Unsaved changes'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-ario-muted text-sm hidden md:block">
          {ideaCount} {ideaCount === 1 ? 'idea' : 'ideas'} in vault
        </div>
        <ModelSelector selectedModelId={selectedModelId} onSelect={onModelChange} />
      </div>
    </div>
  );
}

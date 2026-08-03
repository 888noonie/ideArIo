interface StatusBarProps {
  online: boolean;
  synced: boolean;
  ideaCount: number;
}

/**
 * Slim status strip: online/sync state + idea count only.
 * Theme, model and debug controls live in the Settings tab.
 */
export function StatusBar({ online, synced, ideaCount }: StatusBarProps) {
  return (
    <div className="flex-none flex items-center justify-between px-4 py-1.5 bg-ario-card/30 border-b border-white/5 gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full flex-none ${
              online ? 'bg-ario-turquoise animate-pulse' : 'bg-ario-red'
            }`}
          />
          <span className="text-ario-muted text-xs">
            {online ? 'Online' : 'Offline — saved locally'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-ario-muted flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.745 3.745 0 013.296-1.043A3.745 3.745 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
          </svg>
          <span className="text-ario-muted text-xs">
            {synced ? 'Synced' : 'Unsaved changes'}
          </span>
        </div>
      </div>

      <div className="text-ario-muted text-xs whitespace-nowrap">
        {ideaCount} {ideaCount === 1 ? 'idea' : 'ideas'}
      </div>
    </div>
  );
}

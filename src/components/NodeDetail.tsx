import type { IdearioNode } from '../types/ideario';

interface NodeDetailProps {
  node: IdearioNode;
  allNodes: IdearioNode[];
  ideaTitle?: string;
  onClose: () => void;
}

const TYPE_STYLES: Record<IdearioNode['type'], { label: string; className: string }> = {
  concept: { label: 'Concept', className: 'text-ario-turquoise border-ario-turquoise/40 bg-ario-turquoise/10' },
  action: { label: 'Action', className: 'text-ario-red border-ario-red/40 bg-ario-red/10' },
  question: { label: 'Question', className: 'text-yellow-400 border-yellow-400/40 bg-yellow-400/10' },
  resource: { label: 'Resource', className: 'text-blue-400 border-blue-400/40 bg-blue-400/10' },
};

/**
 * Modal card showing full information for a tapped graph node.
 * Rendered as an overlay inside the idea canvas panel.
 */
export function NodeDetail({ node, allNodes, ideaTitle, onClose }: NodeDetailProps) {
  const typeStyle = TYPE_STYLES[node.type] ?? TYPE_STYLES.concept;

  const connectedNodes = node.connections
    .map((id) => allNodes.find((n) => n.id === id))
    .filter((n): n is IdearioNode => !!n);

  const incoming = allNodes.filter(
    (n) => n.id !== node.id && n.connections.includes(node.id)
  );

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Node details: ${node.label}`}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-ario-grey border border-white/10 p-6
                   shadow-[0_0_60px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <span className={`inline-block px-3 py-1 text-xs font-semibold uppercase tracking-wider
                              rounded-full border ${typeStyle.className}`}>
              {typeStyle.label}
            </span>
            <h3 className="text-2xl font-semibold text-ario-text mt-2 break-words">{node.label}</h3>
            {ideaTitle && (
              <p className="text-ario-muted text-sm mt-1 truncate">from “{ideaTitle}”</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-touch min-h-touch flex items-center justify-center rounded-2xl
                       bg-ario-card text-ario-muted border border-white/10
                       hover:border-ario-turquoise/40 focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
            aria-label="Close node details"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-ario-muted text-xs uppercase tracking-wider mb-2">Connects to</p>
            {connectedNodes.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {connectedNodes.map((n) => (
                  <span
                    key={n.id}
                    className="px-3 py-2 text-sm rounded-xl bg-ario-card text-ario-text border border-white/10"
                  >
                    {n.label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-ario-muted text-sm italic">No outgoing connections</p>
            )}
          </div>

          {incoming.length > 0 && (
            <div>
              <p className="text-ario-muted text-xs uppercase tracking-wider mb-2">Referenced by</p>
              <div className="flex flex-wrap gap-2">
                {incoming.map((n) => (
                  <span
                    key={n.id}
                    className="px-3 py-2 text-sm rounded-xl bg-ario-card/60 text-ario-muted border border-white/5"
                  >
                    {n.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="ario-button w-full mt-6"
        >
          Close
        </button>
      </div>
    </div>
  );
}

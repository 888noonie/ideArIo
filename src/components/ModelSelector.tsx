import { useState, useRef, useEffect } from 'react';
import { MODEL_REGISTRY, getModelById, type ModelInfo } from '../lib/model-registry';

interface ModelSelectorProps {
  selectedModelId: string;
  onSelect: (model: ModelInfo) => void;
}

export function ModelSelector({ selectedModelId, onSelect }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = getModelById(selectedModelId) || MODEL_REGISTRY[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-ario-card border border-white/10
                   text-ario-text text-sm hover:border-ario-turquoise/50 transition-colors
                   focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50 min-h-touch"
      >
        <span className="w-2 h-2 rounded-full bg-ario-turquoise" />
        <span className="hidden sm:inline">{selected.name}</span>
        <span className="sm:hidden">{selected.provider}</span>
        <svg
          className={`w-4 h-4 text-ario-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-72 bg-ario-card rounded-2xl border border-white/10
                        shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden z-50">
          <div className="p-3 border-b border-white/5">
            <p className="text-ario-muted text-xs uppercase tracking-wider">Ario Model</p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {MODEL_REGISTRY.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => {
                  onSelect(model);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-3 transition-colors
                           ${selectedModelId === model.id ? 'bg-ario-turquoise/10' : 'hover:bg-white/5'}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${selectedModelId === model.id ? 'text-ario-turquoise' : 'text-ario-text'}`}>
                    {model.name}
                  </span>
                  {selectedModelId === model.id && (
                    <svg className="w-4 h-4 text-ario-turquoise" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </div>
                <p className="text-ario-muted text-xs mt-1">{model.description}</p>
                <p className="text-ario-muted/60 text-xs mt-0.5">{model.provider}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

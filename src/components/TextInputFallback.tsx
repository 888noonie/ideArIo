import { useState, useCallback } from 'react';

interface TextInputFallbackProps {
  /** Called with the typed idea text — routed through the same pipeline as voice. */
  onSubmit: (text: string) => void;
  /** Return to voice mode. */
  onCancel: () => void;
  /** Disable input while an idea is being processed. */
  busy: boolean;
}

/**
 * Car-safe manual text entry for when the Web Speech API fails or is
 * unavailable. Large touch targets (>= 72px) and high contrast per the
 * Tucson touchscreen constraints.
 */
export function TextInputFallback({ onSubmit, onCancel, busy }: TextInputFallbackProps) {
  const [text, setText] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    onSubmit(trimmed);
    setText('');
  }, [text, busy, onSubmit]);

  return (
    <div className="flex flex-col gap-4 w-full">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        placeholder="Type your idea here... e.g. A solar-powered cooler that mounts on the dashboard"
        rows={5}
        autoFocus
        className="w-full p-4 rounded-2xl bg-ario-card text-ario-text text-lg leading-relaxed
                   border border-white/10 placeholder:text-ario-muted/60
                   focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50
                   resize-none disabled:opacity-50"
        style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
        aria-label="Type your idea"
      />
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="ario-button"
        >
          Back to Voice
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim() || busy}
          className="ario-button border-ario-turquoise/40 text-ario-turquoise
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? 'Processing...' : 'Submit Idea'}
        </button>
      </div>
    </div>
  );
}

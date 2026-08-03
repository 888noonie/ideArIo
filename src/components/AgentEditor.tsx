import { useState, useCallback, useRef } from 'react';
import type { AgentSpec } from '../lib/agents';
import { createAgentId } from '../lib/agents';
import { getProvider, allProviders } from '../lib/providers';
import type { ProviderId } from '../lib/providers/types';

interface AgentEditorProps {
  /** Existing agent to edit, or null to create a new one. */
  agent: AgentSpec | null;
  onSave: (agent: AgentSpec) => void;
  onCancel: () => void;
}

const PROVIDER_LABELS: Record<ProviderId, string> = {
  openrouter: 'OpenRouter',
  ollama: 'Ollama',
  nim: 'NVIDIA NIM (legacy)',
};

/**
 * Add/edit form for one persistent agent. The wake word defaults to
 * "Hey <name>" until the user overrides it. "Fetch models" pulls the
 * provider's live model list into a datalist next to the free-text input.
 */
export function AgentEditor({ agent, onSave, onCancel }: AgentEditorProps) {
  const [name, setName] = useState(agent?.name ?? '');
  const [wakeWord, setWakeWord] = useState(agent?.wakeWord ?? '');
  const wakeTouchedRef = useRef(!!agent);
  const [provider, setProvider] = useState<ProviderId>(agent?.provider ?? 'openrouter');
  const [model, setModel] = useState(agent?.model ?? '');
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? '');
  const [color, setColor] = useState(agent?.color ?? '#00f5d4');
  const [models, setModels] = useState<string[]>([]);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [fetchError, setFetchError] = useState('');

  const handleNameChange = useCallback((value: string) => {
    setName(value);
    if (!wakeTouchedRef.current) {
      setWakeWord(value.trim() ? `Hey ${value.trim()}` : '');
    }
  }, []);

  const handleWakeChange = useCallback((value: string) => {
    wakeTouchedRef.current = true;
    setWakeWord(value);
  }, []);

  const handleFetchModels = useCallback(async () => {
    setFetchState('loading');
    setFetchError('');
    try {
      const list = await getProvider(provider).listModels();
      setModels(list);
      setFetchState('idle');
      if (list.length > 0 && !model) setModel(list[0]);
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Could not fetch models');
      setFetchState('error');
    }
  }, [provider, model]);

  const handleSave = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName || !model.trim()) return;
    onSave({
      id: agent?.id ?? createAgentId(),
      name: trimmedName,
      wakeWord: wakeWord.trim() || `Hey ${trimmedName}`,
      provider,
      model: model.trim(),
      systemPrompt: systemPrompt.trim(),
      color,
      builtIn: agent?.builtIn,
      createdAt: agent?.createdAt ?? Date.now(),
    });
  }, [agent, name, wakeWord, provider, model, systemPrompt, color, onSave]);

  const canSave = name.trim().length > 0 && model.trim().length > 0;
  const datalistId = `models-${provider}`;
  const configured = getProvider(provider).isConfigured();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-ario-text">
          {agent ? 'Edit agent' : 'New agent'}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-14 min-w-14 flex items-center justify-center rounded-2xl
                     bg-ario-card border border-white/10 text-ario-muted
                     hover:border-ario-turquoise/40 focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
          aria-label="Close editor"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Name + color */}
      <div className="grid grid-cols-[1fr_auto] gap-4 items-end">
        <label className="block">
          <span className="text-ario-muted text-sm block mb-2">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Kimi"
            className="w-full min-h-14 px-4 rounded-2xl bg-ario-card text-ario-text text-base
                       border border-white/10 placeholder:text-ario-muted/60
                       focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
            style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
          />
        </label>
        <label className="block">
          <span className="text-ario-muted text-sm block mb-2">Color</span>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-14 h-14 rounded-2xl bg-ario-card border border-white/10 cursor-pointer"
            aria-label="Agent color"
          />
        </label>
      </div>

      {/* Wake word */}
      <label className="block">
        <span className="text-ario-muted text-sm block mb-2">Wake word</span>
        <input
          type="text"
          value={wakeWord}
          onChange={(e) => handleWakeChange(e.target.value)}
          placeholder={`Hey ${name.trim() || 'Name'}`}
          className="w-full min-h-14 px-4 rounded-2xl bg-ario-card text-ario-text text-base
                     border border-white/10 placeholder:text-ario-muted/60
                     focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
          style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
        />
        <span className="text-ario-muted/70 text-xs block mt-1">
          Messages starting with this prefix route to this agent.
        </span>
      </label>

      {/* Provider */}
      <label className="block">
        <span className="text-ario-muted text-sm block mb-2">Provider</span>
        <select
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value as ProviderId);
            setModels([]);
            setFetchState('idle');
          }}
          className="w-full min-h-14 px-4 rounded-2xl bg-ario-card text-ario-text text-base
                     border border-white/10 focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
        >
          {allProviders().map((p) => (
            <option key={p.id} value={p.id}>
              {PROVIDER_LABELS[p.id]}
            </option>
          ))}
        </select>
        {!configured && (
          <span className="text-ario-red/90 text-xs block mt-1">
            This provider needs an API key — add it in Settings.
          </span>
        )}
      </label>

      {/* Model + fetch */}
      <div>
        <span className="text-ario-muted text-sm block mb-2">Model</span>
        <div className="flex gap-3">
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            list={datalistId}
            placeholder={provider === 'ollama' ? 'llama3.1:8b' : 'moonshotai/kimi-k2'}
            className="flex-1 min-h-14 px-4 rounded-2xl bg-ario-card text-ario-text text-base
                       border border-white/10 placeholder:text-ario-muted/60
                       focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
            style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
          />
          <datalist id={datalistId}>
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={handleFetchModels}
            disabled={fetchState === 'loading'}
            className="min-h-14 px-5 rounded-2xl bg-ario-card border border-white/10 text-ario-text
                       text-sm font-medium whitespace-nowrap transition-colors
                       hover:border-ario-turquoise/50 focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50
                       disabled:opacity-40"
          >
            {fetchState === 'loading' ? 'Fetching...' : 'Fetch models'}
          </button>
        </div>
        {fetchState === 'error' && (
          <span className="text-ario-red/90 text-xs block mt-1">{fetchError}</span>
        )}
        {models.length > 0 && (
          <span className="text-ario-muted/70 text-xs block mt-1">
            {models.length} models available — start typing to filter.
          </span>
        )}
      </div>

      {/* System prompt */}
      <label className="block">
        <span className="text-ario-muted text-sm block mb-2">System prompt</span>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={4}
          placeholder="You are a helpful co-pilot inside the Ideario app..."
          className="w-full px-4 py-3 rounded-2xl bg-ario-card text-ario-text text-base leading-relaxed
                     border border-white/10 placeholder:text-ario-muted/60 resize-y
                     focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
          style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
        />
      </label>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button type="button" onClick={onCancel} className="ario-button">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="ario-button bg-ario-turquoise/15 border-ario-turquoise/50 text-ario-turquoise
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {agent ? 'Save changes' : 'Add agent'}
        </button>
      </div>
    </div>
  );
}

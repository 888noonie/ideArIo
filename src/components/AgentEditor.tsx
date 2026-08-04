import { useState, useCallback, useRef } from 'react';
import type { AgentSpec } from '../lib/agents';
import { createAgentId } from '../lib/agents';
import { getProvider, allProviders } from '../lib/providers';
import type { ProviderId } from '../lib/providers/types';
import { ListSelect } from './ui/ListSelect';

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

/** 8 curated swatches (incl. the 3 default agent colors) + 1 neutral dark (A7). */
const COLOR_SWATCHES = [
  '#00f5d4',
  '#7c9eff',
  '#ffb86b',
  '#ff6b8a',
  '#a78bfa',
  '#4ade80',
  '#facc15',
  '#38bdf8',
  '#23272f',
];

/** Default system prompt — prefill so agent creation completes untouched. */
function defaultSystemPrompt(name: string): string {
  return `You are ${name.trim() || 'Ario'}, a helpful in-car voice agent. Keep replies short, warm, and glanceable.`;
}

type FetchState = 'idle' | 'loading' | 'error' | 'done';

/**
 * Add/edit form for one persistent agent. The wake word defaults to
 * "Hey <name>" until the user overrides it. All pickers are ListSelect
 * (no native <select>/<datalist>/<input type="color"> — the AA host
 * display server crashes on native popups).
 */
export function AgentEditor({ agent, onSave, onCancel }: AgentEditorProps) {
  const [name, setName] = useState(agent?.name ?? '');
  const [wakeWord, setWakeWord] = useState(agent?.wakeWord ?? '');
  const wakeTouchedRef = useRef(!!agent);
  const promptTouchedRef = useRef(!!agent);
  const [provider, setProvider] = useState<ProviderId>(agent?.provider ?? 'openrouter');
  const [model, setModel] = useState(agent?.model ?? '');
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? '');
  const [color, setColor] = useState(agent?.color ?? '#00f5d4');
  const [models, setModels] = useState<string[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [fetchError, setFetchError] = useState('');

  const handleNameChange = useCallback((value: string) => {
    setName(value);
    if (!wakeTouchedRef.current) {
      setWakeWord(value.trim() ? `Hey ${value.trim()}` : '');
    }
    // Prefill the default system prompt until the user edits it directly.
    if (!promptTouchedRef.current) {
      setSystemPrompt(value.trim() ? defaultSystemPrompt(value) : '');
    }
  }, []);

  const handleWakeChange = useCallback((value: string) => {
    wakeTouchedRef.current = true;
    setWakeWord(value);
  }, []);

  const handlePromptChange = useCallback((value: string) => {
    promptTouchedRef.current = true;
    setSystemPrompt(value);
  }, []);

  const handleProviderChange = useCallback((value: string) => {
    setProvider(value as ProviderId);
    setModels([]);
    setFetchState('idle');
    setFetchError('');
  }, []);

  const handleFetchModels = useCallback(async () => {
    setFetchState('loading');
    setFetchError('');
    try {
      const list = await getProvider(provider).listModels();
      setModels(list);
      setFetchState('done');
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
      // Optional field — falls back to the prefilled default when left empty.
      systemPrompt: systemPrompt.trim() || defaultSystemPrompt(trimmedName),
      color,
      builtIn: agent?.builtIn,
      createdAt: agent?.createdAt ?? Date.now(),
    });
  }, [agent, name, wakeWord, provider, model, systemPrompt, color, onSave]);

  const canSave = name.trim().length > 0 && model.trim().length > 0;
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

      {/* Name */}
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

      {/* Color swatches (replaces native <input type="color">) */}
      <div>
        <span className="text-ario-muted text-sm block mb-2">Color</span>
        <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Agent color">
          {COLOR_SWATCHES.map((swatch) => {
            const isSelected = color === swatch;
            return (
              <button
                key={swatch}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`Agent color ${swatch}`}
                onClick={() => setColor(swatch)}
                style={{ backgroundColor: swatch }}
                className={`min-h-12 min-w-12 w-12 h-12 rounded-full border border-white/20
                           transition-transform focus:outline-none focus:ring-2 focus:ring-ario-turquoise/60
                           ${isSelected
                             ? 'ring-2 ring-ario-turquoise ring-offset-2 ring-offset-ario-dark scale-110'
                             : ''}`}
              />
            );
          })}
        </div>
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

      {/* Provider (ListSelect — native <select> crashes the AA host) */}
      <div>
        <span className="text-ario-muted text-sm block mb-2">Provider</span>
        <ListSelect
          value={provider}
          options={allProviders().map((p) => ({ value: p.id, label: PROVIDER_LABELS[p.id] }))}
          onChange={handleProviderChange}
          ariaLabel="Agent provider"
        />
        {!configured && (
          <span className="text-ario-red/90 text-xs block mt-1">
            This provider needs an API key — add it in Settings.
          </span>
        )}
      </div>

      {/* Model + fetch */}
      <div>
        <span className="text-ario-muted text-sm block mb-2">Model</span>
        <div className="flex gap-3">
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={provider === 'ollama' ? 'llama3.1:8b' : 'moonshotai/kimi-k2'}
            className="flex-1 min-w-0 min-h-14 px-4 rounded-2xl bg-ario-card text-ario-text text-base
                       border border-white/10 placeholder:text-ario-muted/60
                       focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
            style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
          />
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
        {fetchState !== 'idle' && (
          <div className="mt-2">
            <ListSelect
              value={model}
              options={models.map((m) => ({ value: m, label: m }))}
              onChange={setModel}
              placeholder="Pick a fetched model"
              loading={fetchState === 'loading'}
              error={fetchState === 'error' ? fetchError : null}
              ariaLabel="Fetched models"
            />
          </div>
        )}
        {fetchState === 'done' && models.length === 0 && (
          <span className="text-ario-muted/70 text-xs block mt-1">
            The provider returned no models — type one manually above.
          </span>
        )}
        {fetchState === 'done' && models.length > 0 && (
          <span className="text-ario-muted/70 text-xs block mt-1">
            {models.length} models available.
          </span>
        )}
      </div>

      {/* System prompt (optional — prefilled default, userSelect:text for the
          flaky virtual keyboard; body is globally user-select:none) */}
      <label className="block">
        <span className="text-ario-muted text-sm block mb-2">
          System prompt <span className="text-ario-muted/60">(optional)</span>
        </span>
        <textarea
          value={systemPrompt}
          onChange={(e) => handlePromptChange(e.target.value)}
          rows={4}
          placeholder={defaultSystemPrompt(name)}
          className="w-full px-4 py-3 rounded-2xl bg-ario-card text-ario-text text-base leading-relaxed
                     border border-white/10 placeholder:text-ario-muted/60 resize-y
                     focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
          style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
        />
        <span className="text-ario-muted/70 text-xs block mt-1">
          Leave untouched to keep the prefilled in-car default.
        </span>
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

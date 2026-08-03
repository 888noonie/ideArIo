import { useState, useCallback } from 'react';
import { AgentEditor } from './AgentEditor';
import type { AgentSpec } from '../lib/agents';
import { upsertAgent, deleteAgent } from '../lib/agents';

interface AgentManagerProps {
  agents: AgentSpec[];
  onAgentsChange: (agents: AgentSpec[]) => void;
}

const PROVIDER_LABELS: Record<AgentSpec['provider'], string> = {
  openrouter: 'OpenRouter',
  ollama: 'Ollama',
  nim: 'NIM',
};

/**
 * Agents tab: list persistent agents (color dot, name, wake word,
 * provider:model), add/edit/delete via the AgentEditor form. All changes
 * persist to localStorage through the agents lib helpers.
 */
export function AgentManager({ agents, onAgentsChange }: AgentManagerProps) {
  const [editing, setEditing] = useState<AgentSpec | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleSave = useCallback((agent: AgentSpec) => {
    onAgentsChange(upsertAgent(agent));
    setEditing(null);
    setCreating(false);
  }, [onAgentsChange]);

  const handleDelete = useCallback((id: string) => {
    onAgentsChange(deleteAgent(id));
    setConfirmDeleteId(null);
    setEditing(null);
  }, [onAgentsChange]);

  const showEditor = creating || editing !== null;

  if (showEditor) {
    return (
      <div className="h-full overflow-y-auto chat-scroll">
        <div className="max-w-2xl mx-auto p-6">
          <AgentEditor
            agent={editing}
            onSave={handleSave}
            onCancel={() => {
              setEditing(null);
              setCreating(false);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto chat-scroll">
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-ario-text">Agents</h2>
            <p className="text-ario-muted text-sm mt-1">
              Persistent chat agents. Address them by wake word in the Chat tab.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="min-h-14 px-5 rounded-2xl bg-ario-turquoise/15 border border-ario-turquoise/50
                       text-ario-turquoise text-sm font-semibold whitespace-nowrap transition-colors
                       hover:bg-ario-turquoise/25 focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
          >
            + Add agent
          </button>
        </div>

        {agents.length === 0 && (
          <div className="rounded-3xl bg-ario-grey border border-white/5 p-8 text-center">
            <p className="text-ario-muted">No agents configured. Add one to start chatting.</p>
          </div>
        )}

        {agents.map((agent) => (
          <div
            key={agent.id}
            className="rounded-3xl bg-ario-grey border border-white/5 p-5 flex items-center gap-4"
          >
            <span
              className="w-4 h-4 rounded-full flex-none"
              style={{ backgroundColor: agent.color }}
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-lg font-semibold text-ario-text">{agent.name}</span>
                <span className="text-ario-muted text-sm">{agent.wakeWord}</span>
              </div>
              <p className="text-ario-muted/80 text-sm truncate mt-0.5">
                {PROVIDER_LABELS[agent.provider]}:{agent.model}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditing(agent)}
              className="min-h-14 px-4 rounded-2xl bg-ario-card border border-white/10 text-ario-text
                         text-sm font-medium transition-colors hover:border-ario-turquoise/50
                         focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
            >
              Edit
            </button>
            {confirmDeleteId === agent.id ? (
              <button
                type="button"
                onClick={() => handleDelete(agent.id)}
                className="min-h-14 px-4 rounded-2xl bg-ario-red/15 border border-ario-red/50 text-ario-red
                           text-sm font-semibold transition-colors hover:bg-ario-red/25
                           focus:outline-none focus:ring-2 focus:ring-ario-red/50"
              >
                Confirm
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDeleteId(agent.id)}
                className="min-h-14 px-4 rounded-2xl bg-ario-card border border-white/10 text-ario-muted
                           text-sm font-medium transition-colors hover:border-ario-red/50 hover:text-ario-red
                           focus:outline-none focus:ring-2 focus:ring-ario-red/50"
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

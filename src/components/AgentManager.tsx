import { useState, useCallback } from 'react';
import { AgentEditor } from './AgentEditor';
import type { AgentSpec } from '../lib/agents';
import { upsertAgent, deleteAgent } from '../lib/agents';
import { getProvider } from '../lib/providers';
import { sendAgentSync } from '../lib/settings-sync';

interface AgentManagerProps {
  agents: AgentSpec[];
  onAgentsChange: (agents: AgentSpec[]) => void;
}

const PROVIDER_LABELS: Record<AgentSpec['provider'], string> = {
  openrouter: 'OpenRouter',
  ollama: 'Ollama',
  nim: 'NIM',
  gemini: 'Google Gemini',
  groq: 'Groq',
  ofox: 'OfoxAI',
};

interface HealthState {
  checking: boolean;
  ok?: boolean;
  detail?: string;
}

/** Heroicons outline: signal (radio tower). */
function SignalIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.788m13.788 0c3.808 3.808 3.808 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
      />
    </svg>
  );
}

/** Heroicons outline: pencil-square (edit). */
function EditIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
      />
    </svg>
  );
}

/** Heroicons outline: trash (delete). */
function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}

/**
 * Agents tab: persistent agents in a two-per-row card grid (50% width each,
 * wrapping vertically inside the scroll region), each with a compact
 * icon-button row: health check (signal tower), edit, delete. All changes
 * persist to localStorage through the agents lib helpers.
 */
export function AgentManager({ agents, onAgentsChange }: AgentManagerProps) {
  const [editing, setEditing] = useState<AgentSpec | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [health, setHealth] = useState<Record<string, HealthState>>({});
  const [preserveDisplayAgents, setPreserveDisplayAgents] = useState(true);
  const [syncStatus, setSyncStatus] = useState<{ ok: boolean; text: string } | null>(null);

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

  const handleHealthCheck = useCallback(async (agent: AgentSpec) => {
    setHealth((prev) => ({ ...prev, [agent.id]: { checking: true } }));
    const provider = getProvider(agent.provider);
    if (!provider.healthCheck) {
      setHealth((prev) => ({
        ...prev,
        [agent.id]: { checking: false, ok: false, detail: 'Health check not supported' },
      }));
      return;
    }
    try {
      const result = await provider.healthCheck();
      setHealth((prev) => ({
        ...prev,
        [agent.id]: { checking: false, ok: result.ok, detail: result.detail },
      }));
    } catch (error) {
      setHealth((prev) => ({
        ...prev,
        [agent.id]: {
          checking: false,
          ok: false,
          detail: error instanceof Error ? error.message : 'Health check failed',
        },
      }));
    }
  }, []);

  const handleAgentSync = useCallback(() => {
    const result = sendAgentSync(preserveDisplayAgents);
    setSyncStatus({
      ok: result.sent,
      text: result.sent ? 'Sent to display — confirm it there.' : (result.reason ?? 'Could not sync agents.'),
    });
  }, [preserveDisplayAgents]);

  const showEditor = creating || editing !== null;

  if (showEditor) {
    return (
      <div className="h-full min-h-0 overflow-y-auto chat-scroll overscroll-contain">
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
    <div className="h-full min-h-0 overflow-y-auto chat-scroll overscroll-contain">
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

        <div className="rounded-2xl bg-ario-card border border-white/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-ario-text text-base font-medium">Sync agents to display</p>
              <p className="text-ario-muted text-xs mt-1">
                Send this phone&apos;s agents over the verified WebRTC link.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAgentSync}
              className="min-h-12 px-4 rounded-2xl bg-ario-turquoise/15 border border-ario-turquoise/50 text-ario-turquoise text-sm font-semibold
                         hover:bg-ario-turquoise/25 focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
            >
              Sync now
            </button>
          </div>
          <button
            type="button"
            onClick={() => setPreserveDisplayAgents((current) => !current)}
            aria-pressed={preserveDisplayAgents}
            className={`mt-3 min-h-12 w-full px-4 rounded-2xl border text-left text-sm font-medium
                       focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50
                       ${preserveDisplayAgents
                         ? 'bg-ario-turquoise/10 border-ario-turquoise/40 text-ario-text'
                         : 'bg-ario-red/10 border-ario-red/40 text-ario-red'}`}
          >
            Do not delete display agents: {preserveDisplayAgents ? 'On' : 'Off'}
          </button>
          {syncStatus && (
            <p
              role="status"
              className={`mt-2 text-xs ${syncStatus.ok ? 'text-ario-turquoise' : 'text-ario-red'}`}
            >
              {syncStatus.text}
            </p>
          )}
        </div>

        {agents.length === 0 && (
          <div className="rounded-3xl bg-ario-grey border border-white/5 p-8 text-center">
            <p className="text-ario-muted">No agents configured. Add one to start chatting.</p>
          </div>
        )}

        {/* Two cards per row (50% each), wrapping vertically. */}
        <div className="grid grid-cols-2 gap-3">
          {agents.map((agent) => {
            const agentHealth = health[agent.id];
            return (
              <div
                key={agent.id}
                className="rounded-3xl bg-ario-grey border border-white/5 p-4 min-w-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3 h-3 rounded-full flex-none"
                    style={{ backgroundColor: agent.color }}
                    aria-hidden="true"
                  />
                  <span className="text-base font-semibold text-ario-text truncate">
                    {agent.name}
                  </span>
                </div>
                <p className="text-ario-muted text-sm truncate mt-1">{agent.wakeWord}</p>
                <p className="text-ario-muted/80 text-xs truncate mt-0.5">
                  {PROVIDER_LABELS[agent.provider]}:{agent.model}
                </p>

                {/* Inline health result */}
                {agentHealth && !agentHealth.checking && agentHealth.detail && (
                  <p
                    className={`flex items-center gap-1.5 text-xs mt-2 min-w-0 ${
                      agentHealth.ok ? 'text-ario-turquoise' : 'text-ario-red'
                    }`}
                    role="status"
                  >
                    <span
                      className={`w-2 h-2 rounded-full flex-none ${
                        agentHealth.ok ? 'bg-ario-turquoise' : 'bg-ario-red'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="truncate">{agentHealth.detail}</span>
                  </p>
                )}
                {agentHealth?.checking && (
                  <p className="text-ario-muted text-xs mt-2" role="status">
                    Checking…
                  </p>
                )}

                {/* Compact icon-button row: health / edit / delete */}
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => handleHealthCheck(agent)}
                    disabled={agentHealth?.checking}
                    aria-label={`Check ${agent.name} provider health`}
                    title="Ping provider"
                    className="min-h-12 min-w-12 flex-1 flex items-center justify-center rounded-2xl
                               bg-ario-card border border-white/10 text-ario-muted transition-colors
                               hover:border-ario-turquoise/50 hover:text-ario-turquoise
                               focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50
                               disabled:opacity-40"
                  >
                    <SignalIcon className={`w-5 h-5 ${agentHealth?.checking ? 'animate-pulse' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(agent)}
                    aria-label={`Edit ${agent.name}`}
                    title="Edit agent"
                    className="min-h-12 min-w-12 flex-1 flex items-center justify-center rounded-2xl
                               bg-ario-card border border-white/10 text-ario-muted transition-colors
                               hover:border-ario-turquoise/50 hover:text-ario-text
                               focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
                  >
                    <EditIcon className="w-5 h-5" />
                  </button>
                  {confirmDeleteId === agent.id ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(agent.id)}
                      aria-label={`Confirm delete ${agent.name}`}
                      className="min-h-12 min-w-12 flex-1 flex items-center justify-center rounded-2xl
                                 bg-ario-red/15 border border-ario-red/50 text-ario-red
                                 text-xs font-semibold transition-colors hover:bg-ario-red/25
                                 focus:outline-none focus:ring-2 focus:ring-ario-red/50"
                    >
                      Sure?
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(agent.id)}
                      aria-label={`Delete ${agent.name}`}
                      title="Delete agent"
                      className="min-h-12 min-w-12 flex-1 flex items-center justify-center rounded-2xl
                                 bg-ario-card border border-white/10 text-ario-muted transition-colors
                                 hover:border-ario-red/50 hover:text-ario-red
                                 focus:outline-none focus:ring-2 focus:ring-ario-red/50"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

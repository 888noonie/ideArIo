import type { ProviderId } from './providers/types';

export interface AgentSpec {
  id: string;
  name: string;          // "Kimi"
  wakeWord: string;      // "Hey Kimi"
  provider: ProviderId;
  model: string;
  systemPrompt: string;
  color: string;         // hex accent, e.g. '#00f5d4'
  builtIn?: boolean;
  createdAt: number;
}

const STORAGE_KEY = 'ideario-agents';

export const DEFAULT_AGENTS: AgentSpec[] = [
  {
    id: 'agent-kimi',
    name: 'Kimi',
    wakeWord: 'Hey Kimi',
    provider: 'openrouter',
    model: 'moonshotai/kimi-k2',
    systemPrompt:
      'You are Kimi, a helpful synthesis architect inside the ideArIo idea-capture app. ' +
      'You take raw, half-formed ideas and weave them into clear, structured concepts: ' +
      'name the core idea, sketch the big picture, connect related threads, and suggest ' +
      'concrete next steps. Be warm, concise, and organized. Use short paragraphs or ' +
      'bullet points; avoid jargon unless the user introduces it.',
    color: '#00f5d4',
    builtIn: true,
    createdAt: 0,
  },
  {
    id: 'agent-deepseek',
    name: 'DeepSeek',
    wakeWord: 'Hey DeepSeek',
    provider: 'openrouter',
    model: 'deepseek/deepseek-chat',
    systemPrompt:
      'You are DeepSeek, a precise technical reasoning agent inside the ideArIo ' +
      'idea-capture app. You analyze ideas rigorously: feasibility, architecture, ' +
      'trade-offs, edge cases, and implementation detail. Prefer exact, correct answers ' +
      'over vague encouragement. Show your reasoning briefly, flag assumptions, and call ' +
      'out risks. Keep responses focused and skimmable.',
    color: '#7c9eff',
    builtIn: true,
    createdAt: 0,
  },
  {
    id: 'agent-ario-local',
    name: 'Ario Local',
    wakeWord: 'Hey Ario',
    provider: 'ollama',
    model: 'llama3.1:8b',
    systemPrompt:
      'You are Ario Local, the offline fallback assistant of the ideArIo idea-capture ' +
      'app, running on the user\'s own machine via Ollama. You work fully offline: ' +
      'capture and refine ideas, summarize, brainstorm, and organize thoughts without ' +
      'any cloud service. Be brief, practical, and dependable. If a request needs ' +
      'capabilities you lack, say so plainly and suggest an online agent instead.',
    color: '#ffb86b',
    builtIn: true,
    createdAt: 0,
  },
];

function isValidAgent(value: unknown): value is AgentSpec {
  if (typeof value !== 'object' || value === null) return false;
  const a = value as Partial<AgentSpec>;
  return (
    typeof a.id === 'string' &&
    typeof a.name === 'string' &&
    typeof a.wakeWord === 'string' &&
    (a.provider === 'openrouter' || a.provider === 'ollama' || a.provider === 'nim') &&
    typeof a.model === 'string' &&
    typeof a.systemPrompt === 'string' &&
    typeof a.color === 'string' &&
    typeof a.createdAt === 'number'
  );
}

/**
 * Load persisted agents. On first run (or corrupted storage) seeds DEFAULT_AGENTS
 * and persists them so built-ins can be edited like any other agent.
 */
export function loadAgents(): AgentSpec[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(isValidAgent);
        if (valid.length > 0) return valid;
      }
    } catch {
      // corrupted JSON — fall through to seeding
    }
  }

  const seeded = DEFAULT_AGENTS.map((a) => ({ ...a }));
  saveAgents(seeded);
  return seeded;
}

export function saveAgents(agents: AgentSpec[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
  } catch {
    // storage unavailable — fail silently
  }
}

/** Insert or replace (by id) an agent; persists and returns the new list. */
export function upsertAgent(agent: AgentSpec): AgentSpec[] {
  const agents = loadAgents();
  const index = agents.findIndex((a) => a.id === agent.id);
  if (index >= 0) {
    agents[index] = agent;
  } else {
    agents.push(agent);
  }
  saveAgents(agents);
  return agents;
}

/** Remove an agent by id; persists and returns the new list. */
export function deleteAgent(id: string): AgentSpec[] {
  const agents = loadAgents().filter((a) => a.id !== id);
  saveAgents(agents);
  return agents;
}

export function createAgentId(): string {
  return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

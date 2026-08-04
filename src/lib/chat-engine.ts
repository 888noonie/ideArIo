import type { AgentSpec } from './agents';
import type { RoutedPrompt } from './wake-router';
import type { ChatMessage } from './providers/types';
import { getProvider } from './providers';

export interface ChatEntry {
  id: string;
  // 'system' = bridge/rate-limit notices (rendered centered/muted by UI).
  role: 'user' | 'agent' | 'system';
  agentId?: string;
  agentName?: string;
  color?: string;
  content: string;
  status: 'done' | 'thinking' | 'error';
  ts: number;
}

const STORAGE_KEY = 'ideario-chat-log';
const MAX_ENTRIES = 200;
const HISTORY_ENTRIES = 20;

/** Window event (detail: string) that appends a system entry to the chat log. */
export const CHAT_SYSTEM_ENTRY_EVENT = 'ideario-chat-system-entry';

export function loadChatLog(): ChatEntry[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as ChatEntry[]).slice(-MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function saveChatLog(entries: ChatEntry[]): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries.slice(-MAX_ENTRIES))
    );
  } catch {
    // storage unavailable — fail silently
  }
}

export function clearChatLog(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable — fail silently
  }
}

function createEntryId(): string {
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Per-agent conversation history: prior user messages, that agent's own
 * replies, and other agents' replies as context — last 20 entries.
 */
function buildHistoryMessages(agent: AgentSpec, history: ChatEntry[]): ChatMessage[] {
  return history.slice(-HISTORY_ENTRIES).map((entry) => {
    if (entry.role === 'user') {
      return { role: 'user', content: entry.content };
    }
    if (entry.agentId === agent.id) {
      return { role: 'assistant', content: entry.content };
    }
    // Another agent's reply, attributed so this agent can tell who said what.
    const speaker = entry.agentName ?? 'another agent';
    return { role: 'user', content: `[${speaker}]: ${entry.content}` };
  });
}

async function runAgent(
  agent: AgentSpec,
  routed: RoutedPrompt,
  history: ChatEntry[],
  onUpdate: (entry: ChatEntry) => void
): Promise<void> {
  const base: ChatEntry = {
    id: createEntryId(),
    role: 'agent',
    agentId: agent.id,
    agentName: agent.name,
    color: agent.color,
    content: '',
    status: 'thinking',
    ts: Date.now(),
  };
  onUpdate(base);

  const messages: ChatMessage[] = [
    { role: 'system', content: agent.systemPrompt },
    ...buildHistoryMessages(agent, history),
    { role: 'user', content: routed.cleanPrompt },
  ];

  try {
    const content = await getProvider(agent.provider).chat({
      messages,
      model: agent.model,
    });
    onUpdate({ ...base, content, status: 'done', ts: Date.now() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onUpdate({ ...base, content: message, status: 'error', ts: Date.now() });
  }
}

/**
 * Dispatch the routed prompt to all target agents IN PARALLEL.
 * For each target a 'thinking' placeholder is emitted immediately via
 * onUpdate, then replaced (same id) with a done/error entry.
 */
export async function dispatchToAgents(
  routed: RoutedPrompt,
  history: ChatEntry[],
  onUpdate: (entry: ChatEntry) => void
): Promise<void> {
  await Promise.allSettled(
    routed.targets.map((agent) => runAgent(agent, routed, history, onUpdate))
  );
}

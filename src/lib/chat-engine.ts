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
  /** True for entries received over the bridge mailbox (display role). */
  remote?: boolean;
}

const STORAGE_KEY = 'ideario-chat-log';
const SNAPSHOTS_STORAGE_KEY = 'ideario-chat-snapshots';
const STORAGE_VERSION = 1;
const MAX_ENTRIES = 200;
const MAX_SNAPSHOTS = 50;
const HISTORY_ENTRIES = 20;

export interface ChatSnapshot {
  id: string;
  title: string;
  createdAt: number;
  entries: ChatEntry[];
}

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
    // v0: bare array. v1+: { version, data: ChatEntry[] }
    let entries: unknown;
    if (Array.isArray(parsed)) {
      entries = parsed; // v0 — migrate on next save
    } else if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { data?: unknown }).data)
    ) {
      entries = (parsed as { data: unknown[] }).data;
    } else {
      return [];
    }
    if (!Array.isArray(entries)) return [];
    return (entries as ChatEntry[]).slice(-MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function saveChatLog(entries: ChatEntry[]): void {
  try {
    const envelope = { version: STORAGE_VERSION, data: entries.slice(-MAX_ENTRIES) };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
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

function snapshotTitle(entries: ChatEntry[], createdAt: number): string {
  const firstUserMessage = entries.find((entry) => entry.role === 'user')?.content.trim();
  if (firstUserMessage) {
    return firstUserMessage.replace(/\s+/g, ' ').slice(0, 72);
  }
  return new Date(createdAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function loadChatSnapshots(): ChatSnapshot[] {
  try {
    const raw = window.localStorage.getItem(SNAPSHOTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((snapshot): snapshot is ChatSnapshot => (
      typeof snapshot === 'object' &&
      snapshot !== null &&
      typeof (snapshot as ChatSnapshot).id === 'string' &&
      typeof (snapshot as ChatSnapshot).title === 'string' &&
      typeof (snapshot as ChatSnapshot).createdAt === 'number' &&
      Array.isArray((snapshot as ChatSnapshot).entries)
    )).slice(0, MAX_SNAPSHOTS);
  } catch {
    return [];
  }
}

export function saveChatSnapshot(entries: ChatEntry[]): ChatSnapshot | null {
  const savedEntries = entries.filter((entry) => entry.status !== 'thinking').slice(-MAX_ENTRIES);
  if (savedEntries.length === 0) return null;

  const createdAt = Date.now();
  const snapshot: ChatSnapshot = {
    id: `snapshot-${createdAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: snapshotTitle(savedEntries, createdAt),
    createdAt,
    entries: savedEntries,
  };
  try {
    window.localStorage.setItem(
      SNAPSHOTS_STORAGE_KEY,
      JSON.stringify([snapshot, ...loadChatSnapshots()].slice(0, MAX_SNAPSHOTS))
    );
  } catch {
    return null;
  }
  return snapshot;
}

export function deleteChatSnapshot(id: string): void {
  try {
    const snapshots = loadChatSnapshots().filter((snapshot) => snapshot.id !== id);
    window.localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots));
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
    {
      role: 'system',
      content:
        `${agent.systemPrompt}\nYou are in a car. Never tell the driver to look at the screen or act urgently; keep spoken replies to 1–2 sentences.`,
    },
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

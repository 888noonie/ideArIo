import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react';
import { ChatBubble } from './ChatBubble';
import type { AgentSpec } from '../lib/agents';
import { routePrompt, type RoutedPrompt } from '../lib/wake-router';
import {
  loadChatLog,
  saveChatLog,
  dispatchToAgents,
  type ChatEntry,
} from '../lib/chat-engine';

interface ChatPanelProps {
  agents: AgentSpec[];
}

function createEntryId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Full-area multi-agent chat. Wake-word routing ("Hey Kimi, ..." /
 * "Hey everyone, ...") via routePrompt + dispatchToAgents; quick-tap chips
 * inject the wake-word prefix; no wake word -> the active agent chip.
 */
export function ChatPanel({ agents }: ChatPanelProps) {
  const [entries, setEntries] = useState<ChatEntry[]>(loadChatLog);
  const [input, setInput] = useState('');
  const [activeAgentId, setActiveAgentId] = useState<string | null>(agents[0]?.id ?? null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  // Keep the active agent valid when the agent list changes.
  useEffect(() => {
    if (agents.length === 0) {
      setActiveAgentId(null);
    } else if (!agents.some((a) => a.id === activeAgentId)) {
      setActiveAgentId(agents[0].id);
    }
  }, [agents, activeAgentId]);

  // Persist the log (thinking placeholders are dropped on reload).
  useEffect(() => {
    saveChatLog(entries.filter((e) => e.status !== 'thinking'));
  }, [entries]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [entries]);

  const applyUpdate = useCallback((updated: ChatEntry) => {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [...prev, updated];
    });
  }, []);

  const send = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || sending || agents.length === 0) return;

    const routed = routePrompt(text, agents, activeAgentId);
    if (routed.targets.length === 0 || !routed.cleanPrompt) return;

    const userEntry: ChatEntry = {
      id: createEntryId(),
      role: 'user',
      content: text,
      status: 'done',
      ts: Date.now(),
    };
    const history = [...entriesRef.current, userEntry];
    setEntries(history);
    setInput('');
    setSending(true);
    try {
      await dispatchToAgents(routed, history, applyUpdate);
    } finally {
      setSending(false);
    }
  }, [agents, activeAgentId, sending, applyUpdate]);

  const handleSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    void send(input);
  }, [send, input]);

  const handleRetry = useCallback((failed: ChatEntry) => {
    // Re-dispatch the user prompt that immediately precedes the failed reply.
    const all = entriesRef.current;
    const idx = all.findIndex((e) => e.id === failed.id);
    const userEntry = [...all.slice(0, idx)].reverse().find((e) => e.role === 'user');
    const agent = agents.find((a) => a.id === failed.agentId);
    if (!userEntry || !agent) return;

    const routed: RoutedPrompt = {
      targets: [agent],
      cleanPrompt: routePrompt(userEntry.content, agents, agent.id).cleanPrompt,
      broadcast: false,
    };
    setSending(true);
    void dispatchToAgents(routed, all, applyUpdate).finally(() => setSending(false));
  }, [agents, applyUpdate]);

  const insertWakeWord = useCallback((agent: AgentSpec) => {
    setInput((prev) => {
      const prefix = `${agent.wakeWord}, `;
      // Avoid stacking the same prefix.
      if (prev.toLowerCase().startsWith(agent.wakeWord.toLowerCase())) return prev;
      return prefix + prev;
    });
    setActiveAgentId(agent.id);
  }, []);

  const modelLabelFor = useCallback((entry: ChatEntry) => {
    const agent = agents.find((a) => a.id === entry.agentId);
    return agent ? `${agent.provider}:${agent.model}` : undefined;
  }, [agents]);

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto chat-scroll py-3"
      >
        {entries.length === 0 ? (
          <div className="h-full flex items-center justify-center px-8">
            <div className="text-center max-w-md">
              <p className="text-ario-text text-2xl mb-3">Chat with your agents</p>
              <p className="text-ario-muted text-base leading-relaxed">
                Say <span className="text-ario-turquoise">Hey Kimi</span>, or{' '}
                <span className="text-ario-turquoise">Hey everyone</span> to address all agents.
              </p>
              <p className="text-ario-muted/70 text-sm mt-3">
                Tap a chip below to insert a wake word, or just type to reach the active agent.
              </p>
            </div>
          </div>
        ) : (
          entries.map((entry) => (
            <ChatBubble
              key={entry.id}
              entry={entry}
              modelLabel={modelLabelFor(entry)}
              onRetry={handleRetry}
            />
          ))
        )}
      </div>

      {/* Wake-word chips + active agent selector */}
      <div className="flex-none px-4 pt-2 flex items-center gap-2 overflow-x-auto chat-scroll">
        {agents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            onClick={() => insertWakeWord(agent)}
            className={`flex-none min-h-14 px-4 rounded-2xl border text-sm font-medium
                       flex items-center gap-2 transition-colors
                       focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50
                       ${agent.id === activeAgentId
                         ? 'bg-ario-turquoise/15 border-ario-turquoise/50 text-ario-text'
                         : 'bg-ario-card border-white/10 text-ario-muted hover:border-ario-turquoise/30'}`}
            aria-pressed={agent.id === activeAgentId}
            title={`Insert "${agent.wakeWord}, " — no wake word goes to the active agent`}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ backgroundColor: agent.color }} />
            {agent.wakeWord}
          </button>
        ))}
        {agents.length === 0 && (
          <p className="text-ario-muted text-sm py-3">
            No agents yet — add one in the Agents tab.
          </p>
        )}
      </div>

      {/* Input bar */}
      <form onSubmit={handleSubmit} className="flex-none p-4 flex items-center gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            agents.length === 0
              ? 'Add an agent first...'
              : 'Message — try "Hey everyone, ..."'
          }
          disabled={agents.length === 0}
          enterKeyHint="send"
          className="flex-1 min-h-14 px-5 rounded-2xl bg-ario-card text-ario-text text-base
                     border border-white/10 placeholder:text-ario-muted/60
                     focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50
                     disabled:opacity-50"
          style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
          aria-label="Chat message"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending || agents.length === 0}
          className="min-h-14 min-w-14 flex items-center justify-center rounded-2xl
                     bg-ario-turquoise/15 border border-ario-turquoise/50 text-ario-turquoise
                     transition-all active:scale-95 hover:bg-ario-turquoise/25
                     focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50
                     disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Send message"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </form>
    </div>
  );
}

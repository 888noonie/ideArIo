import { useState, useEffect, useCallback, useRef, type ChangeEvent, type FormEvent } from 'react';
import { ChatBubble } from './ChatBubble';
import type { AgentSpec } from '../lib/agents';
import { routePrompt, type RoutedPrompt } from '../lib/wake-router';
import {
  loadChatLog,
  saveChatLog,
  dispatchToAgents,
  CHAT_SYSTEM_ENTRY_EVENT,
  type ChatEntry,
} from '../lib/chat-engine';
import { tryReflex } from '../lib/reflex';
import { getBridgeSession } from '../lib/bridge/session';
import type { BridgeRole } from '../lib/bridge/types';
import { initCrewAudio, isCrewAudioEnabled, speakAgentReply } from '../lib/crew-audio';
import { createReflexContext } from './reflex-helpers';

const ACTIVE_AGENT_KEY = 'ideario-active-agent';

interface ChatPanelProps {
  agents: AgentSpec[];
  /** Paired mode: URLs in agent bubbles render as "Queue link" buttons. */
  paired?: boolean;
  /**
   * Registration point for the Voice Chat tab: hands back a function that
   * pushes text through the normal send path (reflex lane FIRST, then
   * dispatch/forward) as if it had been typed.
   */
  onSendReady?: (send: (text: string) => Promise<void>) => void;
  /** Called with the reflex confirmation so the voice lane can speak it. */
  onReflexResponse?: (text: string) => void;
  /**
   * False while the Voice Chat tab is hidden (kept mounted). Used to
   * re-snap the scroll position when the tab becomes visible again —
   * scrollTo is a no-op on display:none subtrees.
   */
  visible?: boolean;
}

function createEntryId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Restore the persisted active agent (F3) if it still exists. */
function loadActiveAgentId(agents: AgentSpec[]): string | null {
  try {
    const stored = window.localStorage.getItem(ACTIVE_AGENT_KEY);
    if (stored && agents.some((a) => a.id === stored)) return stored;
  } catch {
    // storage unavailable — fall through
  }
  return agents[0]?.id ?? null;
}

/**
 * Full-area multi-agent chat. Wake-word routing ("Hey Kimi, ..." /
 * "Hey everyone, ...") via routePrompt + dispatchToAgents; quick-tap chips
 * inject the wake-word prefix; no wake word -> the active agent chip.
 */
export function ChatPanel({ agents, paired, onSendReady, onReflexResponse, visible = true }: ChatPanelProps) {
  const [entries, setEntries] = useState<ChatEntry[]>(loadChatLog);
  const [input, setInput] = useState('');
  const [activeAgentId, setActiveAgentId] = useState<string | null>(() => loadActiveAgentId(agents));
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  // ----- Bridge + reflex wiring -----
  const sessionRef = useRef(getBridgeSession());
  const [bridgeRole, setBridgeRole] = useState<BridgeRole | null>(
    () => sessionRef.current.getStatus().role
  );
  const bridgeRoleRef = useRef(bridgeRole);
  const reflexCtxRef = useRef(createReflexContext(() => entriesRef.current));
  const prevConnectedRef = useRef(sessionRef.current.getStatus().connected);
  const seenEnvelopesRef = useRef<Set<string>>(new Set());
  const spokenEntriesRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Keep the active agent valid when the agent list changes.
  useEffect(() => {
    if (agents.length === 0) {
      setActiveAgentId(null);
    } else if (!agents.some((a) => a.id === activeAgentId)) {
      setActiveAgentId(loadActiveAgentId(agents));
    }
  }, [agents, activeAgentId]);

  // Persist the active agent so it (and its wake-word chip highlight)
  // survives a reload.
  useEffect(() => {
    if (!activeAgentId) return;
    try {
      window.localStorage.setItem(ACTIVE_AGENT_KEY, activeAgentId);
    } catch {
      // storage unavailable — fail silently
    }
  }, [activeAgentId]);

  // Persist the log (thinking placeholders are dropped on reload).
  useEffect(() => {
    saveChatLog(entries.filter((e) => e.status !== 'thinking'));
  }, [entries]);

  // Auto-scroll to the newest message. Paired mode (car display) jumps
  // instantly — smooth scrolling reads as viewport jitter there. Also
  // re-snaps when the tab becomes visible again after being hidden
  // (scrollTo is a no-op on display:none subtrees).
  useEffect(() => {
    const el = scrollRef.current;
    if (el && visible) {
      el.scrollTo({ top: el.scrollHeight, behavior: paired ? 'auto' : 'smooth' });
    }
  }, [entries, paired, visible]);

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

  const appendSystemEntry = useCallback((content: string) => {
    if (!mountedRef.current) return;
    const sysEntry: ChatEntry = {
      id: createEntryId(),
      role: 'system',
      content,
      status: 'done',
      ts: Date.now(),
    };
    setEntries((prev) => [...prev, sysEntry]);
  }, []);

  // Replace-by-id merge for incoming 'entries' envelopes (display role),
  // kept in ts order.
  const mergeRemoteEntries = useCallback((incoming: ChatEntry[]) => {
    if (!mountedRef.current) return;
    setEntries((prev) => {
      const byId = new Map(prev.map((e) => [e.id, e] as const));
      for (const e of incoming) {
        if (e && typeof e.id === 'string') byId.set(e.id, e);
      }
      return [...byId.values()].sort((a, b) => a.ts - b.ts);
    });
  }, []);

  // Local dispatch — current (bridge-off) behavior, also used by the hub to
  // run prompts forwarded by the display.
  const dispatchLocal = useCallback(async (rawText: string) => {
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

  const dispatchLocalRef = useRef(dispatchLocal);
  useEffect(() => {
    dispatchLocalRef.current = dispatchLocal;
  }, [dispatchLocal]);

  // Bridge session subscriptions: live status (reconnect notice) + envelopes
  // (display merges 'entries'; hub runs forwarded 'chat-input').
  useEffect(() => {
    initCrewAudio();
    const session = sessionRef.current;
    session.onStatus((status) => {
      const wasConnected = prevConnectedRef.current;
      prevConnectedRef.current = status.connected;
      bridgeRoleRef.current = status.role;
      setBridgeRole(status.role);
      if (!wasConnected && status.connected) {
        const lastUser = [...entriesRef.current].reverse().find((e) => e.role === 'user');
        const thread = lastUser ? lastUser.content.slice(0, 60) : 'none yet';
        appendSystemEntry(`Welcome back — last thread: ${thread}`);
      }
    });
    session.onMessage((env) => {
      if (seenEnvelopesRef.current.has(env.id)) return;
      seenEnvelopesRef.current.add(env.id);
      if (seenEnvelopesRef.current.size > 500) {
        seenEnvelopesRef.current = new Set([...seenEnvelopesRef.current].slice(-250));
      }
      const role = bridgeRoleRef.current;
      if (role === 'display' && env.type === 'entries' && Array.isArray(env.payload)) {
        mergeRemoteEntries(env.payload as ChatEntry[]);
      } else if (role === 'hub' && env.type === 'chat-input' && mountedRef.current) {
        const text = (env.payload as { text?: unknown } | null)?.text;
        if (typeof text === 'string' && text.trim()) {
          void dispatchLocalRef.current(text);
        }
      }
    });
  }, [appendSystemEntry, mergeRemoteEntries]);

  // Hub role: broadcast the log (last 50) on every entries change.
  useEffect(() => {
    if (bridgeRole === 'hub') {
      sessionRef.current.send('entries', entries.slice(-50));
    }
  }, [entries, bridgeRole]);

  // Crew audio: speak each agent reply once when it completes.
  useEffect(() => {
    for (const entry of entries) {
      if (entry.role === 'agent' && entry.status === 'done' && !spokenEntriesRef.current.has(entry.id)) {
        spokenEntriesRef.current.add(entry.id);
        if (isCrewAudioEnabled()) {
          speakAgentReply(entry.content);
        }
      }
    }
  }, [entries]);

  const send = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text) return;

    // (a) Reflex lane FIRST — instant local handling, no LLM dispatch.
    try {
      const reflex = await tryReflex(text, reflexCtxRef.current);
      if (reflex.handled) {
        const userEntry: ChatEntry = {
          id: createEntryId(),
          role: 'user',
          content: text,
          status: 'done',
          ts: Date.now(),
        };
        setEntries((prev) => [...prev, userEntry]);
        appendSystemEntry(reflex.response ?? 'Done.');
        onReflexResponse?.(reflex.response ?? 'Done.');
        setInput('');
        return;
      }
    } catch (error) {
      console.warn('Reflex lane failed, falling through to dispatch:', error);
    }

    // (c) Display role: forward to the phone hub; replies arrive as 'entries'
    // envelopes and are merged by id.
    if (bridgeRoleRef.current === 'display') {
      sessionRef.current.send('chat-input', { text });
      setInput('');
      return;
    }

    await dispatchLocal(text);
  }, [dispatchLocal, appendSystemEntry, onReflexResponse]);

  // Expose the send path (reflex-first, then dispatch/forward) to the
  // Voice Chat tab so finalized voice transcripts flow exactly like typed
  // input.
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  useEffect(() => {
    onSendReady?.((text: string) => sendRef.current(text));
  }, [onSendReady]);

  // External system entries (e.g. "Settings synced from hub" from App's
  // settings-sync listener) append through state so they render live AND
  // persist via the normal save effect.
  useEffect(() => {
    const handler = (event: Event) => {
      const text = (event as CustomEvent<unknown>).detail;
      if (typeof text === 'string' && text.trim()) {
        appendSystemEntry(text);
      }
    };
    window.addEventListener(CHAT_SYSTEM_ENTRY_EVENT, handler);
    return () => window.removeEventListener(CHAT_SYSTEM_ENTRY_EVENT, handler);
  }, [appendSystemEntry]);

  // `+` file picker: .txt/.md content appends to the draft; anything else
  // gets an honest system notice (no fake parsing).
  const handleFileChosen = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith('.txt') || name.endsWith('.md')) {
      file
        .text()
        .then((text) => {
          setInput((prev) => (prev.trim() ? `${prev}\n${text}` : text));
        })
        .catch(() => appendSystemEntry('Could not read that file.'));
    } else {
      appendSystemEntry("That file type isn't readable here yet");
    }
  }, [appendSystemEntry]);

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
    <div className="chat-panel-root h-full flex flex-col min-h-0">
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
              paired={paired}
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

      {/* Input bar: `+` file picker far LEFT, mic stub immediately RIGHT of Send */}
      <form onSubmit={handleSubmit} className="flex-none p-4 flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleFileChosen}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={agents.length === 0}
          className="min-h-14 min-w-14 flex-none flex items-center justify-center rounded-2xl
                     bg-ario-card border border-white/10 text-ario-muted
                     transition-all active:scale-95 hover:border-ario-turquoise/50 hover:text-ario-text
                     focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50
                     disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Attach a .txt or .md file to the message"
          title="Attach a .txt or .md file to the message"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
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
        {/* Mic stub — voice capture lives one tap away in the Voice Chat
            tab; this keeps the affordance discoverable without a second,
            divergent recording path. */}
        <button
          type="button"
          disabled
          className="min-h-14 min-w-14 flex-none flex items-center justify-center rounded-2xl
                     bg-ario-card border border-white/10 text-ario-muted
                     opacity-40 cursor-not-allowed"
          aria-label="Voice input lives in the Voice Chat tab"
          title="Voice input lives in the Voice Chat tab"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
          </svg>
        </button>
      </form>
    </div>
  );
}

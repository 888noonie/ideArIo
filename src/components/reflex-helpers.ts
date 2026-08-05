import type { ChatEntry } from '../lib/chat-engine';
import type { ReflexContext } from '../lib/reflex';
import type { TrustState } from '../lib/trust';
import { loadTrust, saveTrust } from '../lib/trust';
import { addToQueue } from '../lib/link-queue';
import { stopSpeaking } from '../lib/crew-audio';
import { saveToLocalDB } from '../lib/storage';
import type { SavedIdeario } from '../types/ideario';

/** Window event fired whenever the link queue changes (same-tab sync for BridgeTab). */
export const LINK_QUEUE_CHANGED_EVENT = 'ideario-link-queue-changed';
/** Window event fired whenever the trust config changes (same-tab sync for BridgeTab). */
export const TRUST_CHANGED_EVENT = 'ideario-trust-changed';

const GITHUB_API = 'https://api.github.com';

function createSaveId(): string {
  return `idea-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build a SavedIdeario from the most recent agent reply and the user entry
 * that preceded it. Returns null when the thread has no agent reply yet.
 */
export function buildSavedIdearioFromExchange(
  entries: ChatEntry[],
  tag?: string
): SavedIdeario | null {
  let agentIdx = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].role === 'agent' && entries[i].status === 'done') {
      agentIdx = i;
      break;
    }
  }
  if (agentIdx < 0) return null;

  let userText = '';
  for (let i = agentIdx - 1; i >= 0; i--) {
    if (entries[i].role === 'user') {
      userText = entries[i].content;
      break;
    }
  }

  const cleanTag = tag?.trim() || undefined;
  const firstWords = userText.split(/\s+/).filter(Boolean).slice(0, 6).join(' ');

  return {
    id: createSaveId(),
    title: cleanTag || firstWords || 'Saved exchange',
    category: 'personal',
    summary: entries[agentIdx].content,
    tags: [cleanTag || 'crew-save'],
    transcript: userText,
    nodes: [],
    gist_id: undefined,
    synced: false,
    source: 'manual',
  };
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

/**
 * Minimal Gist save for reflex saves — mirrors gist-client's POST shape but
 * resolves the token from localStorage 'ideario-github-token' only (matching
 * the bridge mailbox). The build-time env fallback was removed (S-04) — a
 * VITE_ var would be inlined into the client bundle. Deliberately does NOT
 * touch gist-client.
 */
export async function saveExchangeToGist(saved: SavedIdeario): Promise<void> {
  let token: string | null = null;
  try {
    token = window.localStorage.getItem('ideario-github-token');
  } catch {
    token = null;
  }
  if (!token) return;

  const filename = `${slugify(saved.title)}-${saved.id}.yaml`;
  const yaml = [
    `title: ${JSON.stringify(saved.title)}`,
    `category: ${saved.category}`,
    `summary: ${JSON.stringify(saved.summary)}`,
    `tags: [${saved.tags.map((t) => JSON.stringify(t)).join(', ')}]`,
    `transcript: ${JSON.stringify(saved.transcript ?? '')}`,
    'nodes: []',
  ].join('\n');

  const response = await fetch(`${GITHUB_API}/gists`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      description: `Ideario: ${saved.title}`,
      public: false,
      files: {
        [filename]: { content: yaml },
        'metadata.json': {
          content: JSON.stringify(
            {
              id: saved.id,
              title: saved.title,
              category: saved.category,
              tags: saved.tags,
              source: saved.source,
            },
            null,
            2
          ),
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub Gist failed: ${await response.text()}`);
  }
}

/**
 * Shared ReflexContext factory — used by ChatPanel (typed lane) and the App
 * capture path (voice lane). getEntries must return the CURRENT chat entries
 * (ChatPanel state, or the persisted log from the capture tab).
 */
export function createReflexContext(getEntries: () => ChatEntry[]): ReflexContext {
  return {
    saveLastExchange: async (tag?: string) => {
      const saved = buildSavedIdearioFromExchange(getEntries(), tag);
      if (!saved) {
        return 'Nothing to save yet — no agent reply in this thread.';
      }
      await saveToLocalDB(saved);
      // Instant confirmation first; the Gist save fires async behind it.
      saveExchangeToGist(saved).catch((error) =>
        console.warn('Reflex gist save failed:', error)
      );
      return saved.title ? `Saved as "${saved.title}".` : 'Saved.';
    },
    queueLink: (url: string, note?: string) => {
      addToQueue(url, note);
      window.dispatchEvent(new Event(LINK_QUEUE_CHANGED_EVENT));
      return `Queued ${url} — open it from the Bridge tab when you are parked.`;
    },
    setTrust: (t: TrustState) => {
      saveTrust({ ...loadTrust(), trust: t });
      window.dispatchEvent(new Event(TRUST_CHANGED_EVENT));
      return t === 'co_pilot'
        ? 'Trust set to co-pilot — I will chime in more.'
        : t === 'autonomous'
          ? 'Trust set to autonomous.'
          : 'Trust set to suggest — I will wait to be called.';
    },
    stopSpeaking: () => stopSpeaking(),
  };
}

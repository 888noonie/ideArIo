/**
 * Gist-backed message mailbox. One private Gist per pairing code acts
 * as a shared append-only-ish message file:
 *
 *   description: EXACTLY 'ideario-bridge-<code>'
 *   file:        messages.json = { envelopes: BridgeEnvelope[] } (last 100 kept)
 *
 * Hub finds the Gist by description (GET /gists?per_page=100) or
 * creates it (public:false). Both sides write the FULL updated file on
 * send (last-write-wins; convergence by envelope id dedupe + ts
 * ordering). poll() returns only envelopes newer than the caller's
 * last-seen watermark, tracked inside the Mailbox.
 *
 * Token resolution: localStorage 'ideario-github-token' FIRST, then
 * import.meta.env.VITE_GITHUB_TOKEN.
 */

import type { BridgeEnvelope } from './types';

const GITHUB_API = 'https://api.github.com';
const TOKEN_KEY = 'ideario-github-token';
const FILE_NAME = 'messages.json';
const MAX_ENVELOPES = 100;

export interface Mailbox {
  send(env: BridgeEnvelope): Promise<void>;
  poll(): Promise<BridgeEnvelope[]>;
}

interface MailboxFile {
  envelopes: BridgeEnvelope[];
}

interface GistListEntry {
  id: string;
  description: string | null;
}

interface GistDetail {
  id: string;
  description: string | null;
  files: Record<string, { content?: string; truncated?: boolean; raw_url?: string }>;
}

function resolveToken(): string | null {
  try {
    const stored = window.localStorage.getItem(TOKEN_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch {
    // storage unavailable — fall through to env
  }
  const envToken = import.meta.env.VITE_GITHUB_TOKEN as string | undefined;
  return envToken && envToken.trim() ? envToken.trim() : null;
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function mailboxDescription(code: string): string {
  return `ideario-bridge-${code}`;
}

async function findMailboxGist(token: string, code: string): Promise<GistListEntry | null> {
  const response = await fetch(`${GITHUB_API}/gists?per_page=100`, {
    headers: headers(token),
  });
  if (!response.ok) {
    throw new Error(`Bridge mailbox lookup failed (HTTP ${response.status}).`);
  }
  const gists = (await response.json()) as GistListEntry[];
  const wanted = mailboxDescription(code);
  return gists.find((gist) => gist.description === wanted) ?? null;
}

async function createMailboxGist(token: string, code: string): Promise<string> {
  const response = await fetch(`${GITHUB_API}/gists`, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: mailboxDescription(code),
      public: false,
      files: {
        [FILE_NAME]: { content: JSON.stringify({ envelopes: [] }) },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Bridge mailbox create failed (HTTP ${response.status}).`);
  }
  const gist = (await response.json()) as { id: string };
  return gist.id;
}

async function readEnvelopes(token: string, gistId: string): Promise<BridgeEnvelope[]> {
  const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
    headers: headers(token),
  });
  if (!response.ok) {
    throw new Error(`Bridge mailbox read failed (HTTP ${response.status}).`);
  }
  const gist = (await response.json()) as GistDetail;
  const file = gist.files[FILE_NAME];
  if (!file) return [];

  let content = file.content;
  if ((!content || file.truncated) && file.raw_url) {
    content = await fetch(file.raw_url).then((r) => (r.ok ? r.text() : ''));
  }
  if (!content) return [];

  try {
    const parsed = JSON.parse(content) as MailboxFile;
    if (!Array.isArray(parsed.envelopes)) return [];
    return parsed.envelopes.filter(
      (env) => env && typeof env.id === 'string' && typeof env.ts === 'number'
    );
  } catch {
    return [];
  }
}

async function writeEnvelopes(
  token: string,
  gistId: string,
  envelopes: BridgeEnvelope[]
): Promise<void> {
  const capped = envelopes
    .slice()
    .sort((a, b) => a.ts - b.ts)
    .slice(-MAX_ENVELOPES);
  const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
    method: 'PATCH',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: {
        [FILE_NAME]: { content: JSON.stringify({ envelopes: capped }) },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Bridge mailbox write failed (HTTP ${response.status}).`);
  }
}

/**
 * Open (find-or-create) the mailbox for a 6-digit pairing code.
 * Throws a descriptive Error when no GitHub token is available.
 */
export async function openMailbox(code: string): Promise<Mailbox> {
  const token = resolveToken();
  if (!token) {
    throw new Error('Bridge needs a GitHub token — add one in Settings (Gist token).');
  }

  const existing = await findMailboxGist(token, code);
  const gistId = existing ? existing.id : await createMailboxGist(token, code);

  // High-water mark: envelopes at/below this ts have already been
  // delivered to poll() callers. Envelope ids are also tracked so
  // same-millisecond arrivals are not lost.
  let lastSeenTs = 0;
  const seenIds = new Set<string>();

  return {
    async send(env: BridgeEnvelope): Promise<void> {
      const current = await readEnvelopes(token, gistId);
      const byId = new Map<string, BridgeEnvelope>();
      for (const existingEnv of current) byId.set(existingEnv.id, existingEnv);
      byId.set(env.id, env);
      await writeEnvelopes(token, gistId, [...byId.values()]);
    },

    async poll(): Promise<BridgeEnvelope[]> {
      const current = await readEnvelopes(token, gistId);
      const fresh = current
        .filter((env) => env.ts > lastSeenTs || !seenIds.has(env.id))
        .sort((a, b) => a.ts - b.ts);
      for (const env of fresh) {
        seenIds.add(env.id);
        if (env.ts > lastSeenTs) lastSeenTs = env.ts;
      }
      // Bound the seen-id set so long sessions do not grow it forever.
      if (seenIds.size > MAX_ENVELOPES * 4) {
        const keep = new Set(current.map((env) => env.id));
        for (const id of seenIds) {
          if (!keep.has(id)) seenIds.delete(id);
        }
      }
      return fresh;
    },
  };
}

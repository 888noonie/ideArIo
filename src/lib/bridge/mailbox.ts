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

// Pairing-code expiry (F-01): a mailbox is valid for 24h. The hub refreshes
// the expiry on each poll near the end, so an active pairing never lapses;
// a stale/abandoned mailbox expires and the display gets a clear error.
const MAILBOX_TTL_MS = 24 * 60 * 60 * 1000; // 24h — generous for a pairing session
const MAILBOX_REFRESH_THRESHOLD = MAILBOX_TTL_MS / 4; // refresh in last 25%

export interface Mailbox {
  send(env: BridgeEnvelope): Promise<void>;
  poll(): Promise<BridgeEnvelope[]>;
}

interface MailboxFile {
  envelopes: BridgeEnvelope[];
  expires_at?: number; // epoch ms; 0/absent = no expiry (back-compat)
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
        [FILE_NAME]: {
          content: JSON.stringify({ envelopes: [], expires_at: Date.now() + MAILBOX_TTL_MS }),
        },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Bridge mailbox create failed (HTTP ${response.status}).`);
  }
  const gist = (await response.json()) as { id: string };
  return gist.id;
}

async function readMailboxFile(token: string, gistId: string): Promise<MailboxFile> {
  const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
    headers: headers(token),
  });
  if (!response.ok) {
    throw new Error(`Bridge mailbox read failed (HTTP ${response.status}).`);
  }
  const gist = (await response.json()) as GistDetail;
  const file = gist.files[FILE_NAME];
  if (!file) return { envelopes: [] };

  let content = file.content;
  if ((!content || file.truncated) && file.raw_url) {
    content = await fetch(file.raw_url).then((r) => (r.ok ? r.text() : ''));
  }
  if (!content) return { envelopes: [] };

  try {
    const parsed = JSON.parse(content) as MailboxFile;
    if (!Array.isArray(parsed.envelopes)) return { envelopes: [] };
    return {
      envelopes: parsed.envelopes.filter(
        (env) => env && typeof env.id === 'string' && typeof env.ts === 'number'
      ),
      expires_at: parsed.expires_at,
    };
  } catch {
    return { envelopes: [] };
  }
}

async function writeEnvelopes(
  token: string,
  gistId: string,
  envelopes: BridgeEnvelope[],
  expiresAt?: number
): Promise<void> {
  const capped = envelopes
    .slice()
    .sort((a, b) => a.ts - b.ts)
    .slice(-MAX_ENVELOPES);
  const file: MailboxFile = { envelopes: capped };
  if (expiresAt) file.expires_at = expiresAt;
  const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
    method: 'PATCH',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: {
        [FILE_NAME]: { content: JSON.stringify(file) },
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

  // Expiry check (F-01): a mailbox past its expires_at is treated as
  // not-found so the display surfaces a clear "generate a new code" error
  // instead of silently serving stale content. Absent expires_at (old
  // mailboxes) = no expiry, for back-compat.
  const initial = await readMailboxFile(token, gistId);
  if (initial.expires_at && Date.now() > initial.expires_at) {
    throw new Error('Pairing code expired — generate a new one on the phone.');
  }

  // High-water mark: envelopes at/below this ts have already been
  // delivered to poll() callers. Envelope ids are also tracked so
  // same-millisecond arrivals are not lost.
  let lastSeenTs = 0;
  const seenIds = new Set<string>();

  return {
    async send(env: BridgeEnvelope): Promise<void> {
      const current = await readMailboxFile(token, gistId);
      const byId = new Map<string, BridgeEnvelope>();
      for (const existingEnv of current.envelopes) byId.set(existingEnv.id, existingEnv);
      byId.set(env.id, env);
      await writeEnvelopes(token, gistId, [...byId.values()], current.expires_at);
    },

    async poll(): Promise<BridgeEnvelope[]> {
      const current = await readMailboxFile(token, gistId);
      // Refresh the expiry near the end of its life so an active pairing
      // never lapses (cheap extra write, only in the last 25% of TTL).
      if (current.expires_at && Date.now() + MAILBOX_REFRESH_THRESHOLD > current.expires_at) {
        await writeEnvelopes(token, gistId, current.envelopes, Date.now() + MAILBOX_TTL_MS);
      }
      const fresh = current.envelopes
        .filter((env) => env.ts > lastSeenTs || !seenIds.has(env.id))
        .sort((a, b) => a.ts - b.ts);
      for (const env of fresh) {
        seenIds.add(env.id);
        if (env.ts > lastSeenTs) lastSeenTs = env.ts;
      }
      // Bound the seen-id set so long sessions do not grow it forever.
      if (seenIds.size > MAX_ENVELOPES * 4) {
        const keep = new Set(current.envelopes.map((env) => env.id));
        for (const id of seenIds) {
          if (!keep.has(id)) seenIds.delete(id);
        }
      }
      return fresh;
    },
  };
}

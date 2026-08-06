/**
 * Relay-backed mailbox for the display-side (or default) bridge transport.
 *
 * In relay mode the Vercel server owns the GitHub Gist mailbox, so neither
 * the phone hub nor the car display needs a local Gist token to pair.
 * The relay only sees SDP/ICE signaling envelopes; settings-sync envelopes
 * flow only over the WebRTC rung after SAS verification.
 */

import type { BridgeEnvelope } from './types';
import { isValidEnvelope } from './validate';
import type { Mailbox } from './mailbox';

const FILE_NAME = 'messages.json';
const MAX_ENVELOPES = 100;
const RELAY_PATH = '/api/bridge-relay';

// Pairing-code expiry (F-01): a mailbox is valid for 24h. The hub refreshes
// the expiry on each poll near the end, so an active pairing never lapses.
const MAILBOX_TTL_MS = 24 * 60 * 60 * 1000;
const MAILBOX_REFRESH_THRESHOLD = MAILBOX_TTL_MS / 4;

export interface RelayCredentials {
  code: string;
  hubSecret?: string;
  displaySecret?: string;
}

interface MailboxFile {
  envelopes: BridgeEnvelope[];
  expires_at?: number;
}

function relayUrl(creds: RelayCredentials): string {
  const secret = creds.hubSecret ?? creds.displaySecret ?? '';
  return `${RELAY_PATH}?action=room&code=${encodeURIComponent(creds.code)}&secret=${encodeURIComponent(secret)}`;
}

async function readMailboxFile(creds: RelayCredentials): Promise<MailboxFile> {
  const response = await fetch(relayUrl(creds));
  if (response.status === 410) {
    throw new Error('Pairing code expired — generate a new one on the phone.');
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Bridge relay read failed (HTTP ${response.status}). ${text.slice(0, 120)}`.trim());
  }
  const parsed = (await response.json()) as MailboxFile;
  if (!parsed || !Array.isArray(parsed.envelopes)) {
    return { envelopes: [] };
  }
  return {
    envelopes: parsed.envelopes.filter(
      (env) => env && typeof env.id === 'string' && typeof env.ts === 'number'
    ),
    expires_at: parsed.expires_at,
  };
}

async function writeEnvelopes(
  creds: RelayCredentials,
  envelopes: BridgeEnvelope[],
  expiresAt?: number
): Promise<void> {
  const capped = envelopes
    .slice()
    .sort((a, b) => a.ts - b.ts)
    .slice(-MAX_ENVELOPES);
  const file: MailboxFile = { envelopes: capped };
  if (expiresAt) file.expires_at = expiresAt;

  const response = await fetch(relayUrl(creds), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      [FILE_NAME]: { content: JSON.stringify(file) },
    }),
  });
  if (response.status === 410) {
    throw new Error('Pairing code expired — generate a new one on the phone.');
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Bridge relay write failed (HTTP ${response.status}). ${text.slice(0, 120)}`.trim());
  }
}

/**
 * Open a relay mailbox using the supplied credentials.
 * The credentials (including secrets) stay in the BridgeSession instance.
 */
export function openRelayMailbox(creds: RelayCredentials): Mailbox {
  let lastSeenTs = 0;
  const seenIds = new Set<string>();

  return {
    async send(env: BridgeEnvelope): Promise<void> {
      if (!isValidEnvelope(env)) {
        throw new Error('Invalid bridge envelope.');
      }
      const current = await readMailboxFile(creds);
      const byId = new Map<string, BridgeEnvelope>();
      for (const existingEnv of current.envelopes) byId.set(existingEnv.id, existingEnv);
      byId.set(env.id, env);
      await writeEnvelopes(creds, [...byId.values()], current.expires_at);
    },

    async poll(): Promise<BridgeEnvelope[]> {
      const current = await readMailboxFile(creds);
      // Refresh the expiry near the end of its life so an active pairing
      // never lapses (cheap extra write, only in the last 25% of TTL).
      if (current.expires_at && Date.now() + MAILBOX_REFRESH_THRESHOLD > current.expires_at) {
        await writeEnvelopes(creds, current.envelopes, Date.now() + MAILBOX_TTL_MS);
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

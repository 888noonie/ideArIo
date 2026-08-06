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
const MAILBOX_TTL_MS = 24 * 60 * 60 * 1000;
const MAILBOX_REFRESH_THRESHOLD = MAILBOX_TTL_MS / 4;

export interface RelayCredentials {
  code: string;
  roomId: string;
  hubSecret?: string;
  displaySecret?: string;
}

interface MailboxFile {
  envelopes: BridgeEnvelope[];
  expires_at?: number;
}

function relayUrl(creds: RelayCredentials): string {
  const secret = creds.hubSecret ?? creds.displaySecret ?? '';
  return `${RELAY_PATH}?action=room&code=${encodeURIComponent(creds.code)}&room=${encodeURIComponent(creds.roomId)}&secret=${encodeURIComponent(secret)}`;
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
  if (!parsed || !Array.isArray(parsed.envelopes)) return { envelopes: [] };
  return {
    envelopes: parsed.envelopes.filter(
      (env) => env && typeof env.id === 'string' && typeof env.ts === 'number'
    ),
    expires_at: parsed.expires_at,
  };
}

async function writeEnvelope(creds: RelayCredentials, envelope: BridgeEnvelope): Promise<void> {
  const response = await fetch(relayUrl(creds), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ envelope }),
  });
  if (response.status === 410) {
    throw new Error('Pairing code expired — generate a new one on the phone.');
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Bridge relay write failed (HTTP ${response.status}). ${text.slice(0, 120)}`.trim());
  }
}

async function refreshExpiry(
  creds: RelayCredentials,
  envelopes: BridgeEnvelope[],
  expiresAt: number
): Promise<void> {
  const capped = envelopes
    .slice()
    .sort((a, b) => a.ts - b.ts)
    .slice(-MAX_ENVELOPES);
  const response = await fetch(relayUrl(creds), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      [FILE_NAME]: { content: JSON.stringify({ envelopes: capped, expires_at: expiresAt }) },
    }),
  });
  if (!response.ok) {
    throw new Error(`Bridge relay refresh failed (HTTP ${response.status}).`);
  }
}

/** Open a relay mailbox using credentials held only in this BridgeSession. */
export function openRelayMailbox(creds: RelayCredentials): Mailbox {
  let lastSeenTs = 0;
  const seenIds = new Set<string>();
  let writeTail: Promise<void> = Promise.resolve();

  function enqueueWrite(write: () => Promise<void>): Promise<void> {
    const result = writeTail.then(write);
    writeTail = result.catch(() => undefined);
    return result;
  }

  return {
    async send(env: BridgeEnvelope): Promise<void> {
      if (!isValidEnvelope(env)) throw new Error('Invalid bridge envelope.');
      await enqueueWrite(() => writeEnvelope(creds, env));
    },

    async poll(): Promise<BridgeEnvelope[]> {
      const current = await readMailboxFile(creds);
      if (current.expires_at && Date.now() + MAILBOX_REFRESH_THRESHOLD > current.expires_at) {
        await enqueueWrite(() => refreshExpiry(creds, current.envelopes, Date.now() + MAILBOX_TTL_MS));
      }
      const fresh = current.envelopes
        .filter((env) => env.ts > lastSeenTs || !seenIds.has(env.id))
        .sort((a, b) => a.ts - b.ts);
      for (const env of fresh) {
        seenIds.add(env.id);
        if (env.ts > lastSeenTs) lastSeenTs = env.ts;
      }
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

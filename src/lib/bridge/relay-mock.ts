/**
 * Dev-only in-memory bridge relay for `npm run dev`.
 *
 * Mirrors the Vercel `api/bridge-relay.ts` endpoints without needing a
 * server-side GitHub token. Rooms live in memory and vanish on server
 * restart, which is fine for local development.
 *
 * This file is intentionally self-contained (no imports from src/) so it
 * can be imported by vite.config.ts without pulling browser-only modules
 * into the Node type-checking graph.
 */

// Minimal local copy of the BridgeEnvelope contract.
interface BridgeEnvelope {
  id: string;
  from: 'hub' | 'display';
  ts: number;
  type: 'chat-input' | 'entries' | 'signal' | 'ping' | 'state';
  payload: unknown;
}

function isValidEnvelope(env: unknown): env is BridgeEnvelope {
  if (!env || typeof env !== 'object') return false;
  const e = env as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.ts === 'number' &&
    (e.from === 'hub' || e.from === 'display') &&
    typeof e.type === 'string'
  );
}

interface Room {
  code: string;
  hubSecret: string;
  displaySecret: string | null;
  content: string; // raw messages.json content
  expiresAt: number;
  lastActivity: number;
}

const MAILBOX_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ROOMS = 1_000;
const MAX_BODY_BYTES = 64 * 1024;

const rooms = new Map<string, Room>();

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function cleanupExpired(): void {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (room.expiresAt < now) {
      rooms.delete(code);
    }
  }
}

function enforceRoomLimit(): void {
  if (rooms.size <= MAX_ROOMS) return;
  const sorted = [...rooms.entries()].sort((a, b) => a[1].lastActivity - b[1].lastActivity);
  const evictCount = Math.ceil(MAX_ROOMS * 0.1);
  for (let i = 0; i < evictCount && i < sorted.length; i++) {
    rooms.delete(sorted[i][0]);
  }
}

function getRoom(code: string, secret: string): Room | null {
  const room = rooms.get(code);
  if (!room) return null;
  if (room.hubSecret !== secret && room.displaySecret !== secret) return null;
  room.lastActivity = Date.now();
  return room;
}

function readEnvelopes(room: Room): { envelopes: BridgeEnvelope[]; expires_at?: number } {
  try {
    const parsed = JSON.parse(room.content) as { envelopes?: unknown; expires_at?: number };
    if (!parsed || !Array.isArray(parsed.envelopes)) return { envelopes: [] };
    return {
      envelopes: parsed.envelopes.filter(isValidEnvelope),
      expires_at: parsed.expires_at,
    };
  } catch {
    return { envelopes: [] };
  }
}

function readBody(req: { on: (event: string, cb: (chunk: Uint8Array) => void) => void }): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (chunk: Uint8Array) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Payload too large'));
        return;
      }
      raw += chunk.toString();
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function sendJson(
  res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b: string) => void },
  status: number,
  body: unknown
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function handleRelayDevRequest(
  req: { method?: string; url?: string; on: (event: string, cb: (chunk: Uint8Array) => void) => void },
  res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b: string) => void }
): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const action = url.searchParams.get('action') ?? '';

  if (action === 'create' && req.method === 'POST') {
    cleanupExpired();
    enforceRoomLimit();
    let code = randomCode();
    while (rooms.has(code)) code = randomCode();
    const now = Date.now();
    const room: Room = {
      code,
      hubSecret: randomSecret(),
      displaySecret: null,
      content: JSON.stringify({ envelopes: [], expires_at: now + MAILBOX_TTL_MS }),
      expiresAt: now + MAILBOX_TTL_MS,
      lastActivity: now,
    };
    rooms.set(code, room);
    sendJson(res, 200, { code, roomId: code, hubSecret: room.hubSecret, expiresAt: room.expiresAt });
    return;
  }

  if (action === 'join' && req.method === 'POST') {
    cleanupExpired();
    readBody(req).then((raw) => {
      try {
        const body = JSON.parse(raw) as { code?: unknown };
        const code = typeof body.code === 'string' ? body.code : '';
        const room = rooms.get(code);
        if (!room) {
          sendJson(res, 404, { error: 'Pairing code not found.' });
          return;
        }
        if (room.displaySecret) {
          sendJson(res, 409, { error: 'This code is already in use on another display.' });
          return;
        }
        if (room.expiresAt < Date.now()) {
          rooms.delete(code);
          sendJson(res, 410, { error: 'Pairing code expired.' });
          return;
        }
        room.displaySecret = randomSecret();
        room.lastActivity = Date.now();
        sendJson(res, 200, { roomId: code, displaySecret: room.displaySecret, expiresAt: room.expiresAt });
      } catch {
        sendJson(res, 400, { error: 'Invalid request body.' });
      }
    }).catch(() => sendJson(res, 413, { error: 'Payload too large.' }));
    return;
  }

  if (action === 'room') {
    const code = url.searchParams.get('code') ?? '';
    const secret = url.searchParams.get('secret') ?? '';
    const room = getRoom(code, secret);
    if (!room) {
      sendJson(res, 404, { error: 'Room not found or secret invalid.' });
      return;
    }
    if (room.expiresAt < Date.now()) {
      rooms.delete(code);
      sendJson(res, 410, { error: 'Pairing code expired.' });
      return;
    }

    if (req.method === 'GET') {
      sendJson(res, 200, readEnvelopes(room));
      return;
    }

    if (req.method === 'POST') {
      readBody(req).then((raw) => {
        try {
          const body = JSON.parse(raw) as Record<string, unknown>;
          const current = readEnvelopes(room);
          let incoming: BridgeEnvelope[];
          let expiresAt = current.expires_at;
          if (isValidEnvelope(body.envelope)) {
            incoming = [body.envelope];
          } else {
            const file = body['messages.json'] as { content?: unknown } | undefined;
            if (typeof file?.content !== 'string') {
              sendJson(res, 400, { error: 'Missing relay envelope.' });
              return;
            }
            const parsed = JSON.parse(file.content) as { envelopes?: unknown; expires_at?: number };
            if (!parsed || !Array.isArray(parsed.envelopes)) {
              sendJson(res, 400, { error: 'Invalid messages.json shape.' });
              return;
            }
            incoming = parsed.envelopes.filter(isValidEnvelope);
            expiresAt = parsed.expires_at ?? current.expires_at;
          }
          const merged = new Map<string, BridgeEnvelope>();
          for (const envelope of current.envelopes) merged.set(envelope.id, envelope);
          for (const envelope of incoming) merged.set(envelope.id, envelope);
          room.content = JSON.stringify({ envelopes: [...merged.values()], expires_at: expiresAt });
          room.lastActivity = Date.now();
          sendJson(res, 200, { ok: true });
        } catch {
          sendJson(res, 400, { error: 'Invalid request body.' });
        }
      }).catch(() => sendJson(res, 413, { error: 'Payload too large.' }));
      return;
    }
  }

  sendJson(res, 404, { error: 'Not found.' });
}

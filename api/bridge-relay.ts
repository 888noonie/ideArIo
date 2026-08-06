/**
 * Vercel serverless bridge relay.
 *
 * Owns the GitHub Gist mailbox server-side so neither the phone hub nor the
 * car display needs a local Gist token to pair. The relay only carries
 * SDP/ICE signaling envelopes; provider keys still travel over the verified
 * WebRTC DataChannel.
 *
 * This file is intentionally self-contained (no imports from src/) so the
 * API build does not need browser-only DOM/WebRTC types.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const GITHUB_API = 'https://api.github.com';
const FILE_NAME = 'messages.json';
const ROOM_FILE_NAME = 'room.json';

// Minimal local copy of the BridgeEnvelope contract. Kept inline so the
// serverless build stays independent of src/ browser code.
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
const MAILBOX_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENVELOPES = 100;
const MAX_BODY_BYTES = 64 * 1024;

interface RoomFile {
  hub_secret_hash: string;
  display_secret_hash?: string;
  expires_at: number;
}

function getToken(): string {
  return process.env.BRIDGE_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? '';
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

function randomSecret(): string {
  return randomBytes(32).toString('base64url');
}

function randomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Best-effort in-memory rate limit. Vercel serverless instances are ephemeral,
// Best-effort in-memory rate limit for public pairing actions. Vercel
// serverless instances are ephemeral, so this is a speed-bump, not a hard
// guarantee. Authenticated room traffic is deliberately excluded: two paired
// devices poll and signal through the relay faster than this public limit.
const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const MAX_TRACKED_IPS = 5_000;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) {
    hits.set(ip, arr);
    return true;
  }
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > MAX_TRACKED_IPS) {
    for (const key of hits.keys()) {
      if (key !== ip) hits.delete(key);
      if (hits.size <= MAX_TRACKED_IPS) break;
    }
  }
  return false;
}

function originAllowed(req: VercelRequest): boolean {
  const origin = (req.headers.origin as string | undefined) ?? '';
  const forwardedHost = req.headers['x-forwarded-host'];
  const host = (typeof forwardedHost === 'string' ? forwardedHost : req.headers.host ?? '')
    .split(',')[0]
    .trim();
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = (typeof forwardedProto === 'string' ? forwardedProto : 'https')
    .split(',')[0]
    .trim();
  // A browser calling its own deployed origin is allowed even when a custom
  // domain does not match VERCEL_URL's generated deployment hostname.
  if (origin && host && origin === `${protocol}://${host}`) {
    return true;
  }
  const vercelUrl = process.env.VERCEL_URL ?? '';
  if (vercelUrl && (origin === `https://${vercelUrl}` || origin.endsWith(`.${vercelUrl}`))) {
    return true;
  }
  const allowlist = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return allowlist.includes(origin);
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function secretMatches(secret: string, storedHash: string | undefined): boolean {
  if (!storedHash) return false;
  const candidate = Buffer.from(hashSecret(secret), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

function requestTooLarge(req: VercelRequest): boolean {
  const contentLength = Number(req.headers['content-length'] ?? 0);
  return Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES;
}

function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).json(body);
}

async function findMailboxGist(token: string, code: string): Promise<{ id: string } | null> {
  const response = await fetch(`${GITHUB_API}/gists?per_page=100`, {
    headers: headers(token),
  });
  if (!response.ok) return null;
  const gists = (await response.json()) as Array<{ id: string; description: string | null }>;
  return gists.find((gist) => gist.description === mailboxDescription(code)) ?? null;
}

async function createMailboxGist(
  token: string,
  code: string,
  room: RoomFile
): Promise<{ id: string }> {
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
        [ROOM_FILE_NAME]: { content: JSON.stringify(room) },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Gist create failed: HTTP ${response.status}`);
  }
  return (await response.json()) as { id: string };
}

interface GistFiles {
  [FILE_NAME]?: { content?: string; raw_url?: string; truncated?: boolean };
  [ROOM_FILE_NAME]?: { content?: string; raw_url?: string; truncated?: boolean };
}

async function readGist(token: string, gistId: string): Promise<GistFiles> {
  const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
    headers: headers(token),
  });
  if (!response.ok) {
    throw new Error(`Gist read failed: HTTP ${response.status}`);
  }
  const gist = (await response.json()) as { files: GistFiles };
  return gist.files;
}

async function readGistFile(files: GistFiles): Promise<{ envelopes: BridgeEnvelope[]; expires_at?: number }> {
  const file = files[FILE_NAME];
  if (!file) return { envelopes: [] };

  let content = file.content;
  if ((!content || file.truncated) && file.raw_url) {
    content = await fetch(file.raw_url).then((r) => (r.ok ? r.text() : ''));
  }
  if (!content) return { envelopes: [] };

  try {
    const parsed = JSON.parse(content) as { envelopes?: unknown; expires_at?: number };
    if (!parsed || !Array.isArray(parsed.envelopes)) return { envelopes: [] };
    return {
      envelopes: parsed.envelopes.filter(isValidEnvelope),
      expires_at: parsed.expires_at,
    };
  } catch {
    return { envelopes: [] };
  }
}

function readRoomFile(files: GistFiles): RoomFile | null {
  const file = files[ROOM_FILE_NAME];
  if (!file?.content) return null;
  try {
    const parsed = JSON.parse(file.content) as Partial<RoomFile>;
    if (
      typeof parsed.hub_secret_hash !== 'string' ||
      (parsed.display_secret_hash !== undefined && typeof parsed.display_secret_hash !== 'string') ||
      typeof parsed.expires_at !== 'number'
    ) {
      return null;
    }
    return parsed as RoomFile;
  } catch {
    return null;
  }
}

async function writeRoomFile(token: string, gistId: string, room: RoomFile): Promise<void> {
  const response = await fetch(`${GITHUB_API}/gists/${gistId}`, {
    method: 'PATCH',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: { [ROOM_FILE_NAME]: { content: JSON.stringify(room) } } }),
  });
  if (!response.ok) {
    throw new Error(`Room metadata write failed: HTTP ${response.status}`);
  }
}

async function writeGistFile(
  token: string,
  gistId: string,
  envelopes: BridgeEnvelope[],
  expiresAt?: number
): Promise<void> {
  const capped = envelopes.slice().sort((a, b) => a.ts - b.ts).slice(-MAX_ENVELOPES);
  const file: { envelopes: BridgeEnvelope[]; expires_at?: number } = { envelopes: capped };
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
    throw new Error(`Gist write failed: HTTP ${response.status}`);
  }
}

async function handleCreate(req: VercelRequest, res: VercelResponse): Promise<void> {
  const token = getToken();
  if (!token) {
    sendJson(res, 500, { error: 'Relay not configured.' });
    return;
  }

  let code = randomCode();
  let gist = await findMailboxGist(token, code);
  while (gist) {
    code = randomCode();
    gist = await findMailboxGist(token, code);
  }

  const now = Date.now();
  const hubSecret = randomSecret();
  const room: RoomFile = {
    hub_secret_hash: hashSecret(hubSecret),
    expires_at: now + MAILBOX_TTL_MS,
  };
  const createdGist = await createMailboxGist(token, code, room);
  sendJson(res, 200, { code, roomId: createdGist.id, hubSecret, expiresAt: room.expires_at });
}

async function handleJoin(req: VercelRequest, res: VercelResponse): Promise<void> {
  const body = req.body as { code?: unknown } | undefined;
  const code = typeof body?.code === 'string' ? body.code : '';
  if (!/^\d{6}$/.test(code)) {
    sendJson(res, 400, { error: 'Enter a 6-digit pairing code.' });
    return;
  }

  const token = getToken();
  if (!token) {
    sendJson(res, 500, { error: 'Relay not configured.' });
    return;
  }

  const gist = await findMailboxGist(token, code);
  if (!gist) {
    sendJson(res, 404, { error: 'Pairing code not found.' });
    return;
  }

  try {
    const room = readRoomFile(await readGist(token, gist.id));
    if (!room) {
      sendJson(res, 500, { error: 'Pairing room is invalid.' });
      return;
    }
    if (Date.now() > room.expires_at) {
      sendJson(res, 410, { error: 'Pairing code expired.' });
      return;
    }
    if (room.display_secret_hash) {
      sendJson(res, 409, { error: 'This code is already in use on another display.' });
      return;
    }
    const displaySecret = randomSecret();
    room.display_secret_hash = hashSecret(displaySecret);
    await writeRoomFile(token, gist.id, room);
    sendJson(res, 200, { roomId: gist.id, displaySecret, expiresAt: room.expires_at });
  } catch {
    sendJson(res, 500, { error: 'Could not read pairing mailbox.' });
  }
}

async function handleRoom(req: VercelRequest, res: VercelResponse): Promise<void> {
  const code = (req.query.code as string | undefined) ?? '';
  const secret = (req.query.secret as string | undefined) ?? '';
  const roomId = (req.query.room as string | undefined) ?? '';
  const token = getToken();
  if (!token) {
    sendJson(res, 500, { error: 'Relay not configured.' });
    return;
  }

  const gist = /^[a-f0-9]+$/i.test(roomId)
    ? { id: roomId }
    : await findMailboxGist(token, code);
  if (!gist) {
    sendJson(res, 404, { error: 'Room not found or secret invalid.' });
    return;
  }

  let current: { envelopes: BridgeEnvelope[]; expires_at?: number };
  let roomMetadata: RoomFile;
  try {
    const files = await readGist(token, gist.id);
    const room = readRoomFile(files);
    if (!room || (!secretMatches(secret, room.hub_secret_hash) && !secretMatches(secret, room.display_secret_hash))) {
      sendJson(res, 404, { error: 'Room not found or secret invalid.' });
      return;
    }
    if (Date.now() > room.expires_at) {
      sendJson(res, 410, { error: 'Pairing code expired.' });
      return;
    }
    roomMetadata = room;
    current = await readGistFile(files);
  } catch {
    sendJson(res, 500, { error: 'Could not read pairing mailbox.' });
    return;
  }

  if (current.expires_at && Date.now() > current.expires_at) {
    sendJson(res, 410, { error: 'Pairing code expired.' });
    return;
  }

  if (req.method === 'GET') {
    sendJson(res, 200, current);
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;
  let incoming: BridgeEnvelope[];
  let expiresAt = current.expires_at;
  if (isValidEnvelope(body?.envelope)) {
    // Normal sends append a single envelope server-side. This avoids a
    // client-side read-modify-write race between the phone and display.
    incoming = [body.envelope];
  } else {
    const file = body?.[FILE_NAME] as { content?: unknown } | undefined;
    if (typeof file?.content !== 'string') {
      sendJson(res, 400, { error: 'Missing relay envelope.' });
      return;
    }
    try {
      const parsed = JSON.parse(file.content) as { envelopes?: unknown; expires_at?: number };
      if (!parsed || !Array.isArray(parsed.envelopes)) {
        sendJson(res, 400, { error: 'Invalid messages.json shape.' });
        return;
      }
      incoming = parsed.envelopes.filter(isValidEnvelope);
      expiresAt = parsed.expires_at ?? current.expires_at;
    } catch {
      sendJson(res, 400, { error: 'Invalid messages.json content.' });
      return;
    }
  }

  const merged = new Map<string, BridgeEnvelope>();
  for (const envelope of current.envelopes) merged.set(envelope.id, envelope);
  for (const envelope of incoming) merged.set(envelope.id, envelope);
  try {
    await writeGistFile(token, gist.id, [...merged.values()], expiresAt);
    if (expiresAt && expiresAt !== roomMetadata.expires_at) {
      roomMetadata.expires_at = expiresAt;
      await writeRoomFile(token, gist.id, roomMetadata);
    }
  } catch {
    sendJson(res, 500, { error: 'Could not write pairing mailbox.' });
    return;
  }

  sendJson(res, 200, { ok: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST' && req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (requestTooLarge(req)) {
    sendJson(res, 413, { error: 'Payload too large.' });
    return;
  }

  const origin = req.headers.origin as string | undefined;
  const action = (req.query.action as string | undefined) ?? '';
  // Same-origin browser GET requests commonly omit Origin. A room read is
  // still protected by its unguessable per-role capability secret, while all
  // state-changing actions retain the strict origin gate below.
  const authenticatedRoomRead = action === 'room' && req.method === 'GET';
  if ((!origin && !authenticatedRoomRead) || (origin && !originAllowed(req))) {
    sendJson(res, 403, { error: 'Forbidden.' });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ?? 'unknown';
  const publicPairingAction = action === 'create' || action === 'join';
  if (publicPairingAction && rateLimited(ip)) {
    sendJson(res, 429, { error: 'Too many requests.' });
    return;
  }

  const token = getToken();
  if (!token) {
    sendJson(res, 500, { error: 'Relay not configured.' });
    return;
  }

  try {
    if (action === 'create' && req.method === 'POST') {
      await handleCreate(req, res);
      return;
    }
    if (action === 'join' && req.method === 'POST') {
      await handleJoin(req, res);
      return;
    }
    if (action === 'room' && (req.method === 'GET' || req.method === 'POST')) {
      await handleRoom(req, res);
      return;
    }
    sendJson(res, 404, { error: 'Not found.' });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Relay error.' });
  }
}

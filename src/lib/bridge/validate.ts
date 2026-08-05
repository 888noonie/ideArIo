import type { BridgeEnvelope, SignalPayload } from './types';
import type { ChatEntry } from '../chat-engine';

export function isValidEnvelope(env: unknown): env is BridgeEnvelope {
  if (!env || typeof env !== 'object') return false;
  const e = env as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.ts === 'number' &&
    (e.from === 'hub' || e.from === 'display') &&
    typeof e.type === 'string'
  );
}

export function isValidChatEntry(entry: unknown): entry is ChatEntry {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as Record<string, unknown>;
  const validRole = e.role === 'user' || e.role === 'agent' || e.role === 'system';
  const validStatus = e.status === 'done' || e.status === 'thinking' || e.status === 'error';
  return (
    typeof e.id === 'string' &&
    validRole &&
    typeof e.content === 'string' &&
    validStatus &&
    typeof e.ts === 'number' &&
    (e.agentId === undefined || typeof e.agentId === 'string') &&
    (e.agentName === undefined || typeof e.agentName === 'string') &&
    (e.color === undefined || typeof e.color === 'string')
  );
}

export function isValidEntriesPayload(payload: unknown): payload is ChatEntry[] {
  return Array.isArray(payload) && payload.every(isValidChatEntry);
}

export function isValidChatInputPayload(payload: unknown): payload is { text: string } {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    typeof (payload as { text?: unknown }).text === 'string'
  );
}

export function isValidSignalPayload(payload: unknown): payload is SignalPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if ('sdp' in p && p.sdp !== undefined && typeof p.sdp !== 'object') return false;
  if ('candidate' in p && p.candidate !== undefined) {
    if (p.candidate !== null && typeof p.candidate !== 'object') return false;
  }
  return true;
}

export function isValidPingPayload(payload: unknown): payload is { ts: number } {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    typeof (payload as { ts?: unknown }).ts === 'number'
  );
}

export function isValidStatePayload(payload: unknown): payload is Record<string, unknown> {
  return payload !== null && typeof payload === 'object';
}

export function isValidBridgePayload(env: BridgeEnvelope): boolean {
  switch (env.type) {
    case 'entries':
      return isValidEntriesPayload(env.payload);
    case 'chat-input':
      return isValidChatInputPayload(env.payload);
    case 'signal':
      return isValidSignalPayload(env.payload);
    case 'ping':
      return isValidPingPayload(env.payload);
    case 'state':
      return isValidStatePayload(env.payload);
    default:
      return false;
  }
}

/**
 * Settings sync (F2 + A4): hub pushes BYOK keys, Ollama URL, agents, theme
 * and the selected capture model to the paired display over the EXISTING
 * bridge session's 'state' envelope. WebRTC rung ONLY — API keys must never
 * transit the Gist mailbox. Hub → display only; the display never echoes.
 */

import { getBridgeSession } from './bridge/session';
import { loadAgents, type AgentSpec } from './agents';
import { loadTheme } from './theme';
import { allProviders, getApiKey, getOllamaBaseUrl, getOllamaMode, type OllamaMode } from './providers';
import { loadSelectedModelId } from './model-id';

export interface SyncedSettings {
  providerKeys: Record<string, string>; // ideario-key-* values, keyed by provider id
  ollamaBaseUrl: string;
  ollamaMode: OllamaMode;
  agents: AgentSpec[];
  theme: 'light' | 'dark';
  selectedModelId: string;
}

interface SettingsSyncPayload {
  kind?: string;
  settings?: SyncedSettings;
}

/** Collect the current settings from this device's localStorage. */
export function collectSettings(): SyncedSettings {
  const providerKeys: Record<string, string> = {};
  for (const provider of allProviders()) {
    const key = getApiKey(provider.id);
    if (key) providerKeys[provider.id] = key;
  }
  return {
    providerKeys,
    ollamaBaseUrl: getOllamaBaseUrl(),
    ollamaMode: getOllamaMode(),
    agents: loadAgents(),
    theme: loadTheme(),
    // NOTE: the live storage key is 'ideario-selected-model' (see
    // model-registry.ts); F2's shorthand 'ideario-model' refers to it.
    selectedModelId: loadSelectedModelId(),
  };
}

/**
 * Hub only, explicit tap only (no retry, no auto-send). Returns
 * { sent: false, reason } when not on the WebRTC rung or not connected.
 */
export function sendSettingsSync(): { sent: boolean; reason?: string } {
  const session = getBridgeSession();
  const status = session.getStatus();
  if (status.role !== 'hub') {
    return { sent: false, reason: 'Settings sync runs from the phone hub.' };
  }
  if (status.rung !== 'webrtc') {
    return {
      sent: false,
      reason: 'Settings sync needs the WebRTC rung (keys never transit the Gist mailbox).',
    };
  }
  if (!status.connected) {
    return { sent: false, reason: 'No paired display is connected right now.' };
  }
  // S-02: keys only move over a SAS-verified link. A null SAS (couldn't
  // derive) or an unconfirmed code blocks sync with honest copy.
  if (status.sas === null || status.sasVerified !== true) {
    return {
      sent: false,
      reason: 'Confirm the 4-digit code on both devices first.',
    };
  }
  session.send('state', { kind: 'settings-sync', settings: collectSettings() });
  return { sent: true };
}

/**
 * Display side: listen for 'settings-sync' state envelopes and STAGE the
 * settings (S-03) — nothing is written until the user explicitly accepts via
 * `takePendingSettings()`. The display role NEVER echoes settings back.
 *
 * S-03: previously this auto-applied the hub's settings the moment they
 * arrived. A forged peer (see S-02) could inject keys/config. Now the
 * listener only stages; the UI shows a prompt and applies on explicit Accept.
 */
let pendingSettings: SyncedSettings | null = null;

function isSyncedSettings(value: unknown): value is SyncedSettings {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  if (typeof s.ollamaBaseUrl !== 'string') return false;
  if (s.ollamaMode !== 'local' && s.ollamaMode !== 'cloud') return false;
  if (s.theme !== 'light' && s.theme !== 'dark') return false;
  if (typeof s.selectedModelId !== 'string') return false;
  if (!Array.isArray(s.agents)) return false;
  if (typeof s.providerKeys !== 'object' || s.providerKeys === null) return false;
  return Object.values(s.providerKeys as Record<string, unknown>).every(
    (v) => typeof v === 'string'
  );
}

export function initSettingsSyncListener(onPending: (s: SyncedSettings) => void): void {
  const session = getBridgeSession();
  session.onMessage((env) => {
    if (env.type !== 'state') return;
    if (session.getStatus().role !== 'display') return;
    const payload = env.payload as SettingsSyncPayload | null;
    if (payload?.kind === 'settings-sync' && payload.settings && isSyncedSettings(payload.settings)) {
      pendingSettings = payload.settings;
      onPending(payload.settings); // UI shows a prompt; nothing is written yet
    }
  });
}

/** Consume (and clear) the staged settings. Returns null if none pending. */
export function takePendingSettings(): SyncedSettings | null {
  const s = pendingSettings;
  pendingSettings = null;
  return s;
}

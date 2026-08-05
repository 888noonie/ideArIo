/**
 * Settings sync (F2 + A4): hub pushes BYOK keys, Ollama URL, agents, theme
 * and the selected capture model to the paired display over the EXISTING
 * bridge session's 'state' envelope. WebRTC rung ONLY — API keys must never
 * transit the Gist mailbox. Hub → display only; the display never echoes.
 */

import { getBridgeSession } from './bridge/session';
import { loadAgents, type AgentSpec } from './agents';
import { loadTheme } from './theme';
import { allProviders, getApiKey, getOllamaBaseUrl } from './providers';
import { loadSelectedModelId } from './model-id';

export interface SyncedSettings {
  providerKeys: Record<string, string>; // ideario-key-* values, keyed by provider id
  ollamaBaseUrl: string;
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
  session.send('state', { kind: 'settings-sync', settings: collectSettings() });
  return { sent: true };
}

/**
 * Display side: listen for 'settings-sync' state envelopes and hand the
 * settings to `apply` (which persists them + updates React state). The
 * display role NEVER echoes settings back.
 */
export function initSettingsSyncListener(apply: (s: SyncedSettings) => void): void {
  const session = getBridgeSession();
  session.onMessage((env) => {
    if (env.type !== 'state') return;
    if (session.getStatus().role !== 'display') return;
    const payload = env.payload as SettingsSyncPayload | null;
    if (payload?.kind === 'settings-sync' && payload.settings) {
      apply(payload.settings);
    }
  });
}

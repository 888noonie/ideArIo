import type { ChatProvider, ProviderId } from './types';
import { openrouterProvider } from './openrouter';
import { ollamaProvider } from './ollama';
import { nimProvider } from './nim';
import { geminiProvider } from './gemini';
import { groqProvider } from './groq';
import { ofoxProvider } from './ofox';

export type { ChatProvider, ProviderId, ChatMessage, ChatRequest } from './types';

const PROVIDERS: Record<ProviderId, ChatProvider> = {
  openrouter: openrouterProvider,
  ollama: ollamaProvider,
  nim: nimProvider,
  gemini: geminiProvider,
  groq: groqProvider,
  ofox: ofoxProvider,
};

export function getProvider(id: ProviderId): ChatProvider {
  return PROVIDERS[id];
}

export function allProviders(): ChatProvider[] {
  return [openrouterProvider, groqProvider, geminiProvider, ofoxProvider, ollamaProvider, nimProvider];
}

// --- BYOK key storage -------------------------------------------------------
// Keys live ONLY in this browser's localStorage and are only ever sent to the
// matching provider endpoint. Never committed, never proxied through our API.

const keyStorageName = (id: ProviderId) => `ideario-key-${id}`;

export function getApiKey(id: ProviderId): string | null {
  try {
    const value = window.localStorage.getItem(keyStorageName(id));
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function setApiKey(id: ProviderId, key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) {
      window.localStorage.setItem(keyStorageName(id), trimmed);
    } else {
      window.localStorage.removeItem(keyStorageName(id));
    }
  } catch {
    // storage unavailable (private mode, quota) — fail silently
  }
}

const GITHUB_TOKEN_KEY = 'ideario-github-token';

export function wipeKeysOnDevice(): void {
  try {
    for (const provider of allProviders()) {
      window.localStorage.removeItem(keyStorageName(provider.id));
    }
    window.localStorage.removeItem(GITHUB_TOKEN_KEY);
  } catch {
    // Ignore localStorage errors.
  }
}

// --- Ollama base URL ---------------------------------------------------------

const OLLAMA_URL_KEY = 'ideario-ollama-url';
const OLLAMA_MODE_KEY = 'ideario-ollama-mode';
export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
export const OLLAMA_CLOUD_BASE_URL = 'https://ollama.com/api';
export type OllamaMode = 'local' | 'cloud';

export function getOllamaMode(): OllamaMode {
  try {
    return window.localStorage.getItem(OLLAMA_MODE_KEY) === 'cloud' ? 'cloud' : 'local';
  } catch {
    return 'local';
  }
}

export function setOllamaMode(mode: OllamaMode): void {
  try {
    window.localStorage.setItem(OLLAMA_MODE_KEY, mode);
  } catch {
    // storage unavailable — fail silently
  }
}

export function getOllamaBaseUrl(): string {
  try {
    const value = window.localStorage.getItem(OLLAMA_URL_KEY);
    return value && value.trim() ? value.trim() : DEFAULT_OLLAMA_BASE_URL;
  } catch {
    return DEFAULT_OLLAMA_BASE_URL;
  }
}

export function setOllamaBaseUrl(url: string): void {
  try {
    const trimmed = url.trim();
    if (trimmed) {
      window.localStorage.setItem(OLLAMA_URL_KEY, trimmed);
    } else {
      window.localStorage.removeItem(OLLAMA_URL_KEY);
    }
  } catch {
    // storage unavailable — fail silently
  }
}

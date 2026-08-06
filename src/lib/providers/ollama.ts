import type { ChatProvider, ChatRequest } from './types';
import { getApiKey, getOllamaBaseUrl, getOllamaMode, OLLAMA_CLOUD_BASE_URL } from './index';

const TIMEOUT_MS = 30_000;

export const DEFAULT_OLLAMA_MODEL = 'llama3.1:8b';

interface OllamaChatResponse {
  message?: { content?: string };
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string }>;
}

function baseUrl(): string {
  return getOllamaMode() === 'cloud'
    ? OLLAMA_CLOUD_BASE_URL
    : `${getOllamaBaseUrl().replace(/\/+$/, '')}/api`;
}

function connectionError(base: string): Error {
  if (getOllamaMode() === 'cloud') {
    return new Error('Could not reach Ollama Cloud — check your internet connection.');
  }
  return new Error(
    `Could not connect to Ollama at ${base}. Make sure Ollama is running and start it with ` +
      'OLLAMA_ORIGINS=* (or your app origin) so the browser is allowed to call it, e.g. ' +
      'OLLAMA_ORIGINS=* ollama serve.'
  );
}

export const ollamaProvider: ChatProvider = {
  id: 'ollama',
  label: 'Ollama (local or cloud)',
  requiresKey: false,
  isLocal: false,

  isConfigured(): boolean {
    return getOllamaMode() === 'local' || Boolean(getApiKey('ollama'));
  },

  async chat(req: ChatRequest): Promise<string> {
    const base = baseUrl();
    const cloud = getOllamaMode() === 'cloud';
    const key = cloud ? getApiKey('ollama') : null;
    if (cloud && !key) {
      throw new Error('Ollama Cloud API key is missing. Add your key in Settings.');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const onExternalAbort = () => controller.abort();
    req.signal?.addEventListener('abort', onExternalAbort);

    try {
      const response = await fetch(`${base}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 200);
        throw new Error(`Ollama error (${response.status}): ${detail || 'request failed'}`);
      }

      const data = (await response.json()) as OllamaChatResponse;
      const content = data.message?.content;
      if (!content) {
        throw new Error(
          cloud
            ? 'Ollama Cloud returned an empty response. Try a different model.'
            : `Ollama returned an empty response. Is the model pulled? Try: ollama pull ${req.model}`
        );
      }
      return content;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(cloud
          ? 'Ollama Cloud request timed out after 30 seconds. Please try again.'
          : 'Ollama request timed out after 30 seconds. Is the model loaded?');
      }
      if (error instanceof TypeError) {
        throw connectionError(base);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      req.signal?.removeEventListener('abort', onExternalAbort);
    }
  },

  async listModels(): Promise<string[]> {
    const base = baseUrl();
    const cloud = getOllamaMode() === 'cloud';
    const key = cloud ? getApiKey('ollama') : null;
    if (cloud && !key) throw new Error('Add an Ollama Cloud API key in Settings first.');
    let response: Response;
    try {
      response = await fetch(`${base}/tags`, {
        headers: key ? { Authorization: `Bearer ${key}` } : undefined,
      });
    } catch {
      throw connectionError(base);
    }
    if (!response.ok) {
      throw new Error(`Could not fetch Ollama models (HTTP ${response.status}).`);
    }
    const data = (await response.json()) as OllamaTagsResponse;
    return (data.models ?? [])
      .map((m) => m.name)
      .filter((name): name is string => Boolean(name))
      .sort((a, b) => a.localeCompare(b));
  },

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    const base = baseUrl();
    const cloud = getOllamaMode() === 'cloud';
    const key = cloud ? getApiKey('ollama') : null;
    if (cloud && !key) return { ok: false, detail: 'No Ollama Cloud API key stored — add one in Settings' };
    let response: Response;
    try {
      response = await fetch(`${base}/tags`, {
        headers: key ? { Authorization: `Bearer ${key}` } : undefined,
      });
    } catch {
      return { ok: false, detail: `Could not connect to ${base}` };
    }
    if (response.ok) {
      return { ok: true, detail: 'OK 200' };
    }
    return { ok: false, detail: `HTTP ${response.status}` };
  },
};

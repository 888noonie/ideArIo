import type { ChatProvider, ChatRequest } from './types';
import { getApiKey, getOllamaBaseUrl, getOllamaMode } from './index';

const TIMEOUT_MS = 30_000;
// ollama.com sends no Access-Control-Allow-Origin header, so a browser can't
// call it directly — cloud requests go through our own serverless proxy
// (api/ollama-proxy.ts) instead, which relays the BYOK key server-side.
const OLLAMA_PROXY_URL = '/api/ollama-proxy';

export const DEFAULT_OLLAMA_MODEL = 'llama3.1:8b';

interface OllamaChatResponse {
  message?: { content?: string };
  error?: string;
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string }>;
  error?: string;
}

function localBaseUrl(): string {
  return `${getOllamaBaseUrl().replace(/\/+$/, '')}/api`;
}

function connectionError(cloud: boolean, base: string): Error {
  if (cloud) {
    return new Error('Could not reach Ollama Cloud — check your internet connection.');
  }
  return new Error(
    `Could not connect to Ollama at ${base}. Make sure Ollama is running and start it with ` +
      'OLLAMA_ORIGINS=* (or your app origin) so the browser is allowed to call it, e.g. ' +
      'OLLAMA_ORIGINS=* ollama serve.'
  );
}

/** Cloud requests ride our proxy so the browser never hits ollama.com's CORS wall. */
async function proxyFetch(
  path: 'chat' | 'tags',
  apiKey: string,
  payload: unknown,
  signal?: AbortSignal
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(OLLAMA_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, path, payload }),
    signal,
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
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
    const cloud = getOllamaMode() === 'cloud';
    const key = cloud ? getApiKey('ollama') : null;
    if (cloud && !key) {
      throw new Error('Ollama Cloud API key is missing. Add your key in Settings.');
    }
    const base = cloud ? 'Ollama Cloud' : localBaseUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const onExternalAbort = () => controller.abort();
    req.signal?.addEventListener('abort', onExternalAbort);

    try {
      const chatPayload = { model: req.model, messages: req.messages, stream: false };
      let status: number;
      let data: OllamaChatResponse;
      if (cloud) {
        const result = await proxyFetch('chat', key as string, chatPayload, controller.signal);
        status = result.status;
        data = result.body as OllamaChatResponse;
      } else {
        const response = await fetch(`${base}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(chatPayload),
          signal: controller.signal,
        });
        status = response.status;
        data = (await response.json().catch(() => ({}))) as OllamaChatResponse;
      }

      if (status < 200 || status >= 300) {
        const detail = data.error?.slice(0, 200);
        throw new Error(`Ollama error (${status}): ${detail || 'request failed'}`);
      }

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
        throw connectionError(cloud, base);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      req.signal?.removeEventListener('abort', onExternalAbort);
    }
  },

  async listModels(): Promise<string[]> {
    const cloud = getOllamaMode() === 'cloud';
    const key = cloud ? getApiKey('ollama') : null;
    if (cloud && !key) throw new Error('Add an Ollama Cloud API key in Settings first.');
    const base = cloud ? 'Ollama Cloud' : localBaseUrl();
    let status: number;
    let data: OllamaTagsResponse;
    try {
      if (cloud) {
        const result = await proxyFetch('tags', key as string, undefined);
        status = result.status;
        data = result.body as OllamaTagsResponse;
      } else {
        const response = await fetch(`${base}/tags`);
        status = response.status;
        data = (await response.json().catch(() => ({}))) as OllamaTagsResponse;
      }
    } catch {
      throw connectionError(cloud, base);
    }
    if (status < 200 || status >= 300) {
      throw new Error(`Could not fetch Ollama models (HTTP ${status}).`);
    }
    return (data.models ?? [])
      .map((m) => m.name)
      .filter((name): name is string => Boolean(name))
      .sort((a, b) => a.localeCompare(b));
  },

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    const cloud = getOllamaMode() === 'cloud';
    const key = cloud ? getApiKey('ollama') : null;
    if (cloud && !key) return { ok: false, detail: 'No Ollama Cloud API key stored — add one in Settings' };
    const base = cloud ? 'Ollama Cloud' : localBaseUrl();
    let status: number;
    try {
      if (cloud) {
        const result = await proxyFetch('tags', key as string, undefined);
        status = result.status;
      } else {
        const response = await fetch(`${base}/tags`);
        status = response.status;
      }
    } catch {
      return { ok: false, detail: `Could not connect to ${base}` };
    }
    if (status >= 200 && status < 300) {
      return { ok: true, detail: 'OK 200' };
    }
    return { ok: false, detail: `HTTP ${status}` };
  },
};

import type { ChatProvider, ChatRequest } from './types';
import { getOllamaBaseUrl } from './index';

const TIMEOUT_MS = 30_000;

export const DEFAULT_OLLAMA_MODEL = 'llama3.1:8b';

interface OllamaChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string }>;
}

function baseUrl(): string {
  return getOllamaBaseUrl().replace(/\/+$/, '');
}

function connectionError(base: string): Error {
  return new Error(
    `Could not connect to Ollama at ${base}. Make sure Ollama is running and start it with ` +
      'OLLAMA_ORIGINS=* (or your app origin) so the browser is allowed to call it, e.g. ' +
      'OLLAMA_ORIGINS=* ollama serve.'
  );
}

export const ollamaProvider: ChatProvider = {
  id: 'ollama',
  label: 'Ollama (local)',
  requiresKey: false,
  isLocal: true,

  isConfigured(): boolean {
    // The base URL always has a default, so Ollama counts as configured;
    // reachability is only known once a request is attempted.
    return Boolean(getOllamaBaseUrl());
  },

  async chat(req: ChatRequest): Promise<string> {
    const base = baseUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const onExternalAbort = () => controller.abort();
    req.signal?.addEventListener('abort', onExternalAbort);

    try {
      const response = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(
          `Ollama returned an empty response. Is the model pulled? Try: ollama pull ${req.model}`
        );
      }
      return content;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Ollama request timed out after 30 seconds. Is the model loaded?');
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
    let response: Response;
    try {
      response = await fetch(`${base}/api/tags`);
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
};

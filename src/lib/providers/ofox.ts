import type { ChatProvider, ChatRequest } from './types';
import { getApiKey } from './index';

const CHAT_URL = 'https://api.ofox.ai/v1/chat/completions';
const MODELS_URL = 'https://api.ofox.ai/v1/models';
const TIMEOUT_MS = 30_000;

interface OfoxChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

interface OfoxModelsResponse {
  data?: Array<{ id?: string }>;
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string };
    if (typeof parsed.error === 'string') return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // Not JSON — fall through to the response text.
  }
  return text.slice(0, 200) || `HTTP ${response.status}`;
}

export const ofoxProvider: ChatProvider = {
  id: 'ofox',
  label: 'OfoxAI',
  requiresKey: true,
  isLocal: false,

  isConfigured(): boolean {
    return Boolean(getApiKey('ofox'));
  },

  async chat(req: ChatRequest): Promise<string> {
    const key = getApiKey('ofox');
    if (!key) {
      throw new Error('OfoxAI API key is missing. Add your key in Settings.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const onExternalAbort = () => controller.abort();
    req.signal?.addEventListener('abort', onExternalAbort);

    try {
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: req.model, messages: req.messages }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await readErrorMessage(response);
        if (response.status === 401) {
          throw new Error('OfoxAI rejected the request (401 Unauthorized) — check your key in Settings.');
        }
        throw new Error(`OfoxAI error (${response.status}): ${detail}`);
      }
      const data = (await response.json()) as OfoxChatResponse;
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('OfoxAI returned an empty response. Try a different model.');
      return content;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('OfoxAI request timed out after 30 seconds. Please try again.');
      }
      if (error instanceof TypeError) {
        throw new Error('Could not reach OfoxAI — check your internet connection.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      req.signal?.removeEventListener('abort', onExternalAbort);
    }
  },

  async listModels(): Promise<string[]> {
    const key = getApiKey('ofox');
    if (!key) throw new Error('Add an OfoxAI API key in Settings first.');
    const response = await fetch(MODELS_URL, { headers: { Authorization: `Bearer ${key}` } });
    if (!response.ok) throw new Error(`Could not fetch OfoxAI models (HTTP ${response.status}).`);
    const data = (await response.json()) as OfoxModelsResponse;
    return (data.data ?? []).map((model) => model.id).filter((id): id is string => Boolean(id)).sort();
  },

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    const key = getApiKey('ofox');
    if (!key) return { ok: false, detail: 'No API key stored — add one in Settings' };
    try {
      const response = await fetch(MODELS_URL, { headers: { Authorization: `Bearer ${key}` } });
      return response.ok ? { ok: true, detail: 'OK 200' } : { ok: false, detail: `HTTP ${response.status}` };
    } catch {
      return { ok: false, detail: 'Could not reach OfoxAI' };
    }
  },
};

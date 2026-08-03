import type { ChatProvider, ChatRequest } from './types';
import { getApiKey } from './index';

const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const TIMEOUT_MS = 30_000;

export const DEFAULT_OPENROUTER_MODEL = 'moonshotai/kimi-k2';

interface OpenRouterChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

interface OpenRouterModelsResponse {
  data?: Array<{ id?: string }>;
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string };
    if (typeof parsed.error === 'string') return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // not JSON — fall through to raw text
  }
  return text.slice(0, 200) || `HTTP ${response.status}`;
}

export const openrouterProvider: ChatProvider = {
  id: 'openrouter',
  label: 'OpenRouter',
  requiresKey: true,
  isLocal: false,

  isConfigured(): boolean {
    return Boolean(getApiKey('openrouter'));
  },

  async chat(req: ChatRequest): Promise<string> {
    const key = getApiKey('openrouter');
    if (!key) {
      throw new Error(
        'OpenRouter API key is missing. Add your key in Settings (get one at https://openrouter.ai/keys).'
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    // Allow a caller-supplied signal to also cancel the request.
    const onExternalAbort = () => controller.abort();
    req.signal?.addEventListener('abort', onExternalAbort);

    try {
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Ideario',
        },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await readErrorMessage(response);
        if (response.status === 401) {
          throw new Error(
            'OpenRouter rejected the request (401 Unauthorized) — check your OpenRouter key in Settings.'
          );
        }
        throw new Error(`OpenRouter error (${response.status}): ${detail}`);
      }

      const data = (await response.json()) as OpenRouterChatResponse;
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('OpenRouter returned an empty response. Try a different model.');
      }
      return content;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('OpenRouter request timed out after 30 seconds. Please try again.');
      }
      if (error instanceof TypeError) {
        throw new Error('Could not reach OpenRouter — check your internet connection.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      req.signal?.removeEventListener('abort', onExternalAbort);
    }
  },

  async listModels(): Promise<string[]> {
    const response = await fetch(MODELS_URL);
    if (!response.ok) {
      throw new Error(`Could not fetch OpenRouter models (HTTP ${response.status}).`);
    }
    const data = (await response.json()) as OpenRouterModelsResponse;
    const ids = (data.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => Boolean(id));
    return ids.sort((a, b) => a.localeCompare(b));
  },
};

import type { ChatProvider, ChatRequest } from './types';
import { MODEL_REGISTRY } from '../model-registry';

const TIMEOUT_MS = 30_000;

interface NimChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export const nimProvider: ChatProvider = {
  id: 'nim',
  label: 'NVIDIA NIM',
  requiresKey: false, // key lives server-side (NVIDIA_API_KEY in Vercel)
  isLocal: false,

  isConfigured(): boolean {
    // The API key is held by the serverless proxy, so from the browser's
    // perspective the provider is always configured.
    return true;
  },

  async chat(req: ChatRequest): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const onExternalAbort = () => controller.abort();
    req.signal?.addEventListener('abort', onExternalAbort);

    try {
      const response = await fetch('/api/nim-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: req.messages, model: req.model }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 200);
        if (/NVIDIA_API_KEY not configured/i.test(detail)) {
          throw new Error(
            'The NVIDIA API key is missing on the server. Add NVIDIA_API_KEY in Vercel and redeploy.'
          );
        }
        throw new Error(`NIM proxy error (${response.status}): ${detail || 'request failed'}`);
      }

      const data = (await response.json()) as NimChatResponse;
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('NIM returned an empty response. Try a different model.');
      }
      return content;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('NIM request timed out after 30 seconds. Please try again.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      req.signal?.removeEventListener('abort', onExternalAbort);
    }
  },

  async listModels(): Promise<string[]> {
    return MODEL_REGISTRY.map((m) => m.id);
  },
};

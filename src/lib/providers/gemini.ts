import type { ChatProvider, ChatRequest } from './types';
import { getApiKey } from './index';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 30_000;

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
}

interface GeminiModelsResponse {
  models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
}

function toGeminiContents(messages: ChatRequest['messages']): Array<{ role: string; parts: Array<{ text: string }> }> {
  return messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));
}

function systemInstruction(messages: ChatRequest['messages']): { parts: Array<{ text: string }> } | undefined {
  const content = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n');
  return content ? { parts: [{ text: content }] } : undefined;
}

export const geminiProvider: ChatProvider = {
  id: 'gemini',
  label: 'Google Gemini',
  requiresKey: true,
  isLocal: false,

  isConfigured(): boolean {
    return Boolean(getApiKey('gemini'));
  },

  async chat(req: ChatRequest): Promise<string> {
    const key = getApiKey('gemini');
    if (!key) throw new Error('Gemini API key is missing. Add your key in Settings.');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const onExternalAbort = () => controller.abort();
    req.signal?.addEventListener('abort', onExternalAbort);

    try {
      const response = await fetch(`${API_BASE}/models/${encodeURIComponent(req.model)}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: toGeminiContents(req.messages),
          systemInstruction: systemInstruction(req.messages),
        }),
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as GeminiResponse;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Gemini rejected the request — check your API key and model access in Settings.');
        }
        throw new Error(`Gemini error (${response.status}): ${data.error?.message ?? 'request failed'}`);
      }
      const content = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('')
        .trim() ?? '';
      if (!content) throw new Error('Gemini returned an empty response. Try a different model.');
      return content;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Gemini request timed out after 30 seconds. Please try again.');
      }
      if (error instanceof TypeError) {
        throw new Error('Could not reach Gemini — check your internet connection.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      req.signal?.removeEventListener('abort', onExternalAbort);
    }
  },

  async listModels(): Promise<string[]> {
    const key = getApiKey('gemini');
    if (!key) throw new Error('Add a Gemini API key in Settings first.');
    const response = await fetch(`${API_BASE}/models?key=${encodeURIComponent(key)}`);
    if (!response.ok) throw new Error(`Could not fetch Gemini models (HTTP ${response.status}).`);
    const data = (await response.json()) as GeminiModelsResponse;
    return (data.models ?? [])
      .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
      .map((model) => model.name?.replace(/^models\//, ''))
      .filter((name): name is string => Boolean(name))
      .sort();
  },

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    const key = getApiKey('gemini');
    if (!key) return { ok: false, detail: 'No API key stored — add one in Settings' };
    try {
      const response = await fetch(`${API_BASE}/models?key=${encodeURIComponent(key)}`);
      return response.ok ? { ok: true, detail: 'OK 200' } : { ok: false, detail: `HTTP ${response.status}` };
    } catch {
      return { ok: false, detail: 'Could not reach Gemini' };
    }
  },
};

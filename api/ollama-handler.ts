/**
 * Shared Ollama Cloud proxy logic, framework-agnostic.
 * Used by the Vercel serverless function (api/ollama-proxy.ts) and by the
 * local Vite dev-server middleware (vite.config.ts).
 *
 * Why this exists: ollama.com's API sends no Access-Control-Allow-Origin
 * header, so a browser calling it directly is blocked by CORS before the
 * request ever completes (confirmed via curl — the server responds fine,
 * the browser just refuses to hand the response to script). The key stays
 * BYOK (client-supplied per request, never stored server-side) — this
 * proxy only relays it to avoid the CORS wall, same as any reverse proxy.
 */

export type OllamaProxyPath = 'chat' | 'tags';

export interface OllamaProxyBody {
  apiKey?: string;
  path?: OllamaProxyPath;
  payload?: unknown;
}

export interface OllamaProxyResult {
  status: number;
  body: unknown;
}

const OLLAMA_CLOUD_BASE = 'https://ollama.com/api';
// Vercel caps api/ollama-proxy.ts at 10s. Abort early enough to return
// Ario's own timeout body instead of a raw platform 504.
const TIMEOUT_MS = 8_000;

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

export async function handleOllamaProxyRequest(body: OllamaProxyBody | undefined): Promise<OllamaProxyResult> {
  const apiKey = body?.apiKey?.trim();
  if (!apiKey) {
    return { status: 400, body: { error: 'Missing Ollama Cloud API key' } };
  }
  if (body?.path !== 'chat' && body?.path !== 'tags') {
    return { status: 400, body: { error: 'Invalid proxy path' } };
  }

  const url = `${OLLAMA_CLOUD_BASE}/${body.path}`;
  const init: RequestInit =
    body.path === 'chat'
      ? {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body.payload ?? {}),
        }
      : { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` } };

  let response: Response;
  try {
    response = await fetchWithTimeout(url, init, TIMEOUT_MS);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return {
      status: timedOut ? 504 : 502,
      body: { error: timedOut ? 'Ollama Cloud request timed out.' : 'Could not reach Ollama Cloud.' },
    };
  }

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { error: text || 'Ollama Cloud returned a non-JSON response.' };
  }
  return { status: response.status, body: parsed };
}

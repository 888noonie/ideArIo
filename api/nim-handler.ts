/**
 * Shared NVIDIA NIM proxy logic, framework-agnostic.
 * Used by the Vercel serverless function (api/nim-proxy.ts) and by the
 * local Vite dev-server middleware (vite.config.ts).
 */

export interface NimChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface NimProxyBody {
  transcript: string;
  systemPrompt?: string;
  userPrompt?: string;
  model?: string;
  /**
   * OpenAI-style chat path (additive): when present, the proxy forwards these
   * messages as a chat completion instead of running the legacy
   * transcript/YAML flow.
   */
  messages?: NimChatMessage[];
}

export interface NimProxyResult {
  status: number;
  body: unknown;
}

const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

// F-25: Vercel caps this function at 10s (vercel.json maxDuration). We budget
// the model-fallback loop so the TOTAL worst-case time stays under the cap
// with margin for cold start, instead of 9 models x 6s each (which could be
// killed mid-fallback, producing a raw platform timeout rather than Ario's
// own honest {error, modelsTried} body).
const TOTAL_BUDGET_MS = 8_000; // leave ~2s headroom inside the 10s cap
const MAX_MODELS_TRIED = 4; // cap fallback depth
const MIN_PER_MODEL_TIMEOUT_MS = 1_500; // don't starve a single attempt

/** Per-model timeout so the whole fallback loop fits the budget. */
function perModelTimeout(modelCount: number): number {
  const n = Math.min(modelCount, MAX_MODELS_TRIED);
  return Math.max(Math.floor(TOTAL_BUDGET_MS / n), MIN_PER_MODEL_TIMEOUT_MS);
}

// Default model cycle when no specific model is requested.
// The order matters: try the fast, instruction-following models first
// (structured YAML extraction), then heavier reasoning models.
// NOTE: When adding new models to the frontend registry, add strong candidates here too.
const DEFAULT_MODEL_CYCLE = [
  'deepseek-ai/deepseek-v4-flash',
  'deepseek-ai/deepseek-v4-pro',
  'moonshotai/kimi-k2.6',
  'meta/llama-3.3-70b-instruct',
  'meta/llama-3.1-8b-instruct',
  'mistralai/mistral-large-2-instruct',
  'mistralai/mistral-7b-instruct-v0.3',
  'z-ai/glm-5.2',
  'minimaxai/minimax-m3',
];

function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeout));
}

async function callNIM(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  timeoutMs: number
): Promise<Response> {
  return fetchWithTimeout(
    NVIDIA_ENDPOINT,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        // Generous ceiling: schema v2 YAML (3-7 nodes + context) needs more
        // than 400 tokens, and reasoning models spend tokens thinking first.
        // Truncated YAML was a source of "could not process that idea".
        max_tokens: 2048,
      }),
    },
    timeoutMs // budget-aware (F-25): scales with the fallback depth
  );
}

/**
 * Core request handler. `body` must already be parsed JSON.
 * Returns an HTTP status + JSON-serializable body.
 */
export async function handleNimProxyRequest(
  body: NimProxyBody | undefined,
  apiKey: string | undefined
): Promise<NimProxyResult> {
  if (!apiKey) {
    return { status: 500, body: { error: 'NVIDIA_API_KEY not configured' } };
  }

  // OpenAI-style chat passthrough (additive). Bodies without a `messages`
  // array fall through to the legacy transcript/YAML flow unchanged below.
  if (Array.isArray(body?.messages)) {
    return handleChatCompletion(body.messages, body.model, apiKey);
  }

  const { transcript, systemPrompt, userPrompt, model } = body ?? ({} as NimProxyBody);

  if (!transcript) {
    return { status: 400, body: { error: 'transcript is required' } };
  }

  const finalSystemPrompt = systemPrompt || 'You are Ario. Convert ideas into concise YAML.';
  const finalUserPrompt = userPrompt || transcript;

  // If client requested a specific model, try it first. Otherwise cycle the registry.
  const modelsToTry = (model
    ? [model, ...DEFAULT_MODEL_CYCLE.filter((m) => m !== model)]
    : DEFAULT_MODEL_CYCLE
  ).slice(0, MAX_MODELS_TRIED);

  const timeoutMs = perModelTimeout(modelsToTry.length);
  let lastError = 'Unknown error';

  for (const modelName of modelsToTry) {
    try {
      const response = await callNIM(apiKey, finalSystemPrompt, finalUserPrompt, modelName, timeoutMs);

      if (!response.ok) {
        const errorText = await response.text();
        lastError = errorText;
        continue;
      }

      const data = await response.json();
      return { status: 200, body: data };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      // Continue to next model fallback
    }
  }

  return {
    status: 504,
    body: {
      error: `All AI models failed. Last error: ${String(lastError).slice(0, 200)}`,
      modelsTried: modelsToTry.length,
    },
  };
}

function callNIMChat(
  apiKey: string,
  messages: NimChatMessage[],
  model: string,
  timeoutMs: number
): Promise<Response> {
  return fetchWithTimeout(
    NVIDIA_ENDPOINT,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    },
    timeoutMs // budget-aware (F-25)
  );
}

/**
 * Chat-completion path: forwards an OpenAI-style messages array to NVIDIA,
 * cycling the default model fallback list. Returns the upstream response
 * verbatim, which has the shape `{ choices: [{ message: { content } }] }`.
 */
async function handleChatCompletion(
  messages: NimChatMessage[],
  model: string | undefined,
  apiKey: string
): Promise<NimProxyResult> {
  const valid = messages.filter(
    (m) => m && typeof m.role === 'string' && typeof m.content === 'string'
  );
  if (valid.length === 0) {
    return { status: 400, body: { error: 'messages must be a non-empty array' } };
  }

  const modelsToTry = (model
    ? [model, ...DEFAULT_MODEL_CYCLE.filter((m) => m !== model)]
    : DEFAULT_MODEL_CYCLE
  ).slice(0, MAX_MODELS_TRIED);

  const timeoutMs = perModelTimeout(modelsToTry.length);
  let lastError = 'Unknown error';

  for (const modelName of modelsToTry) {
    try {
      const response = await callNIMChat(apiKey, valid, modelName, timeoutMs);

      if (!response.ok) {
        lastError = await response.text();
        continue;
      }

      const data = await response.json();
      return { status: 200, body: data };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      // Continue to next model fallback
    }
  }

  return {
    status: 504,
    body: {
      error: `All AI models failed. Last error: ${String(lastError).slice(0, 200)}`,
      modelsTried: modelsToTry.length,
    },
  };
}

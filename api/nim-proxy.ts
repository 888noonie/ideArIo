import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ProxyBody {
  transcript?: unknown;
  model?: unknown;
}

const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_TRANSCRIPT_LENGTH = 4_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const RATE_LIMIT_WINDOW_MS = 60_000;

const DEFAULT_MODEL_CYCLE = [
  'deepseek-ai/deepseek-v4-pro',
  'deepseek-ai/deepseek-v4-flash',
  'z-ai/glm-5.2',
  'moonshotai/kimi-k2.6',
  'minimaxai/minimax-m3',
  'meta/llama-3.3-70b-instruct',
  'mistralai/mistral-large-2-instruct',
  'mistralai/mistral-7b-instruct-v0.3',
];

const SYSTEM_PROMPT = `You are Ario, the noble idea companion for Ideario.
Convert the user's spoken idea into a valid Ideario YAML object.

Return only valid YAML with title, category, summary, tags, and nodes. Categories are product, business, creative, technical, or personal. Nodes need lowercase ids, labels, types (concept, action, question, or resource), and connections. The first node must be the core concept. Create 3-7 meaningful nodes.`;

const requestCounts = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(',')[0]?.trim() || 'unknown';
}

function isRateLimited(req: VercelRequest): boolean {
  const now = Date.now();
  const key = getClientIp(req);
  const entry = requestCounts.get(key);

  if (!entry || entry.resetAt <= now) {
    requestCounts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_REQUESTS_PER_WINDOW;
}

function isSameOriginRequest(req: VercelRequest): boolean {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function getAllowedModels(): string[] {
  const configured = process.env.NVIDIA_ALLOWED_MODELS
    ?.split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  return configured && configured.length > 0 ? configured : DEFAULT_MODEL_CYCLE;
}

function isValidModelId(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(value) && value.length <= 120;
}

async function callNIM(
  apiKey: string,
  transcript: string,
  model: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(NVIDIA_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Spoken idea: ${JSON.stringify(transcript)}` },
        ],
        temperature: 0.3,
        max_tokens: 400,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isSameOriginRequest(req)) {
    return res.status(403).json({ error: 'Invalid request origin' });
  }

  if (isRateLimited(req)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Idea generation is not configured' });
  }

  const body = (req.body || {}) as ProxyBody;
  const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
  if (!transcript) {
    return res.status(400).json({ error: 'transcript is required' });
  }
  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    return res.status(413).json({ error: 'transcript is too long' });
  }

  const configuredModels = process.env.NVIDIA_ALLOWED_MODELS;
  const allowedModels = getAllowedModels();
  const requestedModel = typeof body.model === 'string' ? body.model.trim() : '';
  if (requestedModel && !isValidModelId(requestedModel)) {
    return res.status(400).json({ error: 'The selected model is invalid' });
  }
  if (requestedModel && configuredModels && !allowedModels.includes(requestedModel)) {
    return res.status(400).json({ error: 'The selected model is not available' });
  }

  const modelsToTry = requestedModel
    ? [requestedModel, ...allowedModels.filter((model) => model !== requestedModel)]
    : allowedModels;
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;

  for (const model of modelsToTry) {
    const remainingMs = deadline - Date.now();
    if (remainingMs < 1_500) break;

    try {
      const response = await callNIM(apiKey, transcript, model, Math.min(6_000, remainingMs));
      if (!response.ok) continue;

      const data: unknown = await response.json();
      return res.status(200).json(data);
    } catch {
      // Try the next approved model while the function still has time available.
    }
  }

  return res.status(502).json({ error: 'Idea generation is temporarily unavailable. Please try again.' });
}

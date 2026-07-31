import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ProxyBody {
  transcript: string;
  systemPrompt?: string;
  userPrompt?: string;
  model?: string;
}

const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_MODELS = [
  'meta/llama-3.1-8b-instruct',   // Fast, good enough for YAML
  'meta/llama-3.3-70b-instruct',  // Higher quality fallback
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
  transcript: string,
  systemPrompt: string,
  userPrompt: string,
  model: string
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
        max_tokens: 400,
      }),
    },
    8000 // 8 second timeout per attempt
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'NVIDIA_API_KEY not configured' });
  }

  const { transcript, systemPrompt, userPrompt, model } = req.body as ProxyBody;

  if (!transcript) {
    return res.status(400).json({ error: 'transcript is required' });
  }

  const finalSystemPrompt = systemPrompt || 'You are Ario. Convert ideas into concise YAML.';
  const finalUserPrompt = userPrompt || transcript;

  // If a specific model is requested, try only that
  const modelsToTry = model ? [model] : DEFAULT_MODELS;
  let lastError = 'Unknown error';

  for (const modelName of modelsToTry) {
    try {
      const response = await callNIM(apiKey, transcript, finalSystemPrompt, finalUserPrompt, modelName);

      if (!response.ok) {
        const errorText = await response.text();
        lastError = errorText;
        continue;
      }

      const data = await response.json();
      return res.status(200).json(data);
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      // Continue to next model fallback
    }
  }

  return res.status(504).json({ error: `NIM timeout or all models failed: ${lastError}` });
}

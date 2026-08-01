import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Diagnostics endpoint — visit /api/nim-health in any browser to check:
 * 1. Whether NVIDIA_API_KEY reaches the serverless function.
 * 2. Whether the function can actually reach NVIDIA NIM and get a completion.
 * Returns JSON with per-model results. No secrets are exposed.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  const report: Record<string, unknown> = {
    keyConfigured: Boolean(apiKey),
    keyPrefix: apiKey ? `${apiKey.slice(0, 7)}…` : null,
    timestamp: new Date().toISOString(),
    models: [] as unknown[],
  };

  if (!apiKey) {
    report.hint =
      'NVIDIA_API_KEY is not visible to this deployment. Add it in Vercel → Settings → Environment Variables for ALL environments, then REDEPLOY (env vars only apply to deployments built after they are set).';
    return res.status(200).json(report);
  }

  const models = ['deepseek-ai/deepseek-v4-flash', 'meta/llama-3.1-8b-instruct'];

  for (const model of models) {
    const started = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
          max_tokens: 8,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const text = await response.text();
      (report.models as unknown[]).push({
        model,
        httpStatus: response.status,
        ok: response.ok,
        latencyMs: Date.now() - started,
        // First 160 chars of the response (or error) for diagnosis.
        snippet: text.slice(0, 160),
      });
    } catch (error) {
      (report.models as unknown[]).push({
        model,
        ok: false,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return res.status(200).json(report);
}

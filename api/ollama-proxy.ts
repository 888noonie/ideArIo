import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOllamaProxyRequest, type OllamaProxyBody } from './ollama-handler.js';

/** Trust only the Vercel URLs assigned to this project, plus explicit origins. */
function originAllowed(req: VercelRequest): boolean {
  const origin = (req.headers.origin as string | undefined) ?? '';
  const projectUrls = [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ].filter((url): url is string => Boolean(url));
  if (projectUrls.some((url) => origin === `https://${url}`)) {
    return true;
  }
  const allowlist = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return allowlist.includes(origin);
}

// Best-effort in-memory rate limit (per Vercel instance, not a hard guarantee).
const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const MAX_TRACKED_IPS = 5_000;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) {
    hits.set(ip, arr);
    return true;
  }
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > MAX_TRACKED_IPS) {
    for (const key of hits.keys()) {
      if (key !== ip) hits.delete(key);
      if (hits.size <= MAX_TRACKED_IPS) break;
    }
  }
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const origin = req.headers.origin as string | undefined;
  if (!origin || !originAllowed(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ?? 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const result = await handleOllamaProxyRequest(req.body as OllamaProxyBody);
  return res.status(result.status).json(result.body);
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleNimProxyRequest, type NimProxyBody } from './nim-handler.js';

/**
 * Origin gate: the deployed app always sends an Origin on this POST, so a
 * missing Origin is a script, not the app. Reject by default.
 */
function originAllowed(req: VercelRequest): boolean {
  const origin = (req.headers.origin as string | undefined) ?? '';
  const vercelUrl = process.env.VERCEL_URL ?? '';
  // Same-app + preview origins.
  if (vercelUrl && (origin === `https://${vercelUrl}` || origin.endsWith(`.${vercelUrl}`))) {
    return true;
  }
  const allowlist = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return allowlist.includes(origin);
}

// Best-effort in-memory rate limit. Vercel serverless instances are ephemeral,
// so this is a speed-bump against direct scripts, not a hard guarantee.
const hits = new Map<string, number[]>(); // ip -> request timestamps
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
  // Bound the map so a cold instance can't grow it forever.
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

  // Origin gate: reject cross-origin or absent-origin requests.
  const origin = req.headers.origin as string | undefined;
  if (!origin || !originAllowed(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Rate limit (best-effort).
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ?? 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const result = await handleNimProxyRequest(req.body as NimProxyBody, process.env.NVIDIA_API_KEY);
  return res.status(result.status).json(result.body);
}

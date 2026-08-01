import type { VercelRequest, VercelResponse } from '@vercel/node';

interface GistBody {
  id?: unknown;
  title?: unknown;
  category?: unknown;
  tags?: unknown;
  createdAt?: unknown;
  source?: unknown;
  yamlContent?: unknown;
}

const GITHUB_API = 'https://api.github.com/gists';
const MAX_YAML_LENGTH = 50_000;
const MAX_REQUESTS_PER_WINDOW = 6;
const RATE_LIMIT_WINDOW_MS = 60_000;
const GITHUB_TIMEOUT_MS = 7_000;
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

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'untitled-idea';
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
  if (process.env.IDEARIO_GIST_SYNC_ENABLED !== 'true') {
    return res.status(503).json({ error: 'Gist sync is not enabled' });
  }
  if (isRateLimited(req)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(503).json({ error: 'Gist sync is not configured' });
  }

  const body = (req.body || {}) as GistBody;
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const yamlContent = typeof body.yamlContent === 'string' ? body.yamlContent : '';
  if (!id || !title || !yamlContent) {
    return res.status(400).json({ error: 'id, title, and yamlContent are required' });
  }
  if (id.length > 100 || title.length > 120 || yamlContent.length > MAX_YAML_LENGTH) {
    return res.status(413).json({ error: 'Idea payload is too large' });
  }

  const tags = Array.isArray(body.tags)
    ? body.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 8)
    : [];
  const filename = `${slugify(title)}-${id.replace(/[^a-zA-Z0-9_-]/g, '')}.yaml`;
  const payload = {
    description: `Ideario: ${title}`,
    public: false,
    files: {
      [filename]: { content: yamlContent },
      'metadata.json': {
        content: JSON.stringify({
          id,
          title,
          category: typeof body.category === 'string' ? body.category : 'creative',
          tags,
          created_at: typeof body.createdAt === 'string' ? body.createdAt : new Date().toISOString(),
          source: body.source === 'manual' ? 'manual' : 'voice',
        }, null, 2),
      },
    },
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
    const response = await fetch(GITHUB_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) {
      return res.status(502).json({ error: 'Gist sync failed' });
    }

    const data = (await response.json()) as { id?: unknown; html_url?: unknown };
    if (typeof data.id !== 'string' || typeof data.html_url !== 'string') {
      return res.status(502).json({ error: 'Gist sync returned an invalid response' });
    }
    return res.status(201).json({ gist_id: data.id, url: data.html_url });
  } catch {
    return res.status(502).json({ error: 'Gist sync failed' });
  }
}

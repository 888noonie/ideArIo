import type { SavedIdeario } from '../types/ideario';
import { parseIdearioYaml } from './yaml-builder';
import { addToGistIndex, loadGistIndex } from './gist-index';

const GITHUB_API = 'https://api.github.com';

export interface GistFile {
  filename: string;
  content: string;
}

export interface GistCreatePayload {
  description: string;
  public: boolean;
  files: Record<string, { content: string }>;
}

const TOKEN_KEY = 'ideario-github-token';

// Token resolution order matches bridge/mailbox.ts and reflex-helpers.ts:
// the Settings-entered token (localStorage) wins; the build-time env var is
// the fallback, never an override.
function getToken(): string | null {
  try {
    const stored = window.localStorage.getItem(TOKEN_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch {
    // storage unavailable — fall through to env
  }
  const envToken = import.meta.env.VITE_GITHUB_TOKEN as string | undefined;
  return envToken && envToken.trim() ? envToken.trim() : null;
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

export async function saveIdearioToGist(
  ideario: SavedIdeario,
  yamlContent: string
): Promise<{ gist_id: string; url: string }> {
  const token = getToken();
  if (!token) {
    throw new Error('GitHub token not configured');
  }

  const filename = `${slugify(ideario.title)}-${ideario.id}.yaml`;
  const payload: GistCreatePayload = {
    description: `Ideario: ${ideario.title}`,
    public: false,
    files: {
      [filename]: { content: yamlContent },
      'metadata.json': {
        content: JSON.stringify(
          {
            id: ideario.id,
            title: ideario.title,
            category: ideario.category,
            tags: ideario.tags,
            created_at: ideario.created_at,
            source: ideario.source,
          },
          null,
          2
        ),
      },
    },
  };

  const response = await fetch(`${GITHUB_API}/gists`, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub Gist failed: ${error}`);
  }

  const data = (await response.json()) as { id: string; html_url: string };

  // Best-effort: keep the vault index up to date. Failures are fine — the
  // loader falls back to a full Gist scan when the index is missing/stale.
  addToGistIndex(token, {
    id: ideario.id,
    gist_id: data.id,
    title: ideario.title,
    created_at: ideario.created_at,
  }).catch((error) => console.warn('Gist index update failed:', error));

  return { gist_id: data.id, url: data.html_url };
}

interface GistDetail {
  id: string;
  files: Record<string, { content?: string; raw_url?: string; truncated?: boolean }>;
}

/** Fetch a single idea Gist and parse its YAML file. */
async function loadIdeaFromGist(token: string, gistId: string, localId?: string): Promise<SavedIdeario | null> {
  try {
    const response = await fetch(`${GITHUB_API}/gists/${gistId}`, { headers: headers(token) });
    if (!response.ok) return null;

    const gist = (await response.json()) as GistDetail;
    const yamlEntry = Object.entries(gist.files).find(([name]) => name.endsWith('.yaml'));
    if (!yamlEntry) return null;

    const [, file] = yamlEntry;
    let content = file.content;
    if (!content || file.truncated) {
      if (!file.raw_url) return null;
      content = await fetch(file.raw_url).then((r) => (r.ok ? r.text() : ''));
    }
    if (!content) return null;

    const parsed = parseIdearioYaml(content);
    if (!parsed) return null;

    return {
      ...parsed,
      // Prefer the local idea id from the vault index when available so
      // loaded ideas keep matching their IndexedDB records.
      id: localId || gist.id,
      gist_id: gist.id,
      synced: true,
      source: 'voice',
    };
  } catch {
    return null;
  }
}

/** Scan every Gist for Ideario YAML files. */
async function scanGistsForIdeas(token: string): Promise<SavedIdeario[]> {
  const response = await fetch(`${GITHUB_API}/gists?per_page=100`, {
    headers: headers(token),
  });

  if (!response.ok) {
    return [];
  }

  const gists = (await response.json()) as Array<{ id: string; files: Record<string, { raw_url: string }> }>;
  const results: SavedIdeario[] = [];

  for (const gist of gists) {
    const yamlFile = Object.values(gist.files).find((f) => f.raw_url.endsWith('.yaml'));
    if (!yamlFile) continue;

    try {
      const content = await fetch(yamlFile.raw_url).then((r) => r.text());
      const parsed = parseIdearioYaml(content);
      if (!parsed) continue;

      results.push({
        ...parsed,
        id: gist.id,
        gist_id: gist.id,
        synced: true,
        source: 'voice',
      });
    } catch {
      // Skip unparseable gists
    }
  }

  return results;
}

/**
 * Load the vault. Prefers the "ideario-index" Gist (one index read + one
 * fetch per idea Gist) and gracefully falls back to scanning all Gists
 * when the index is missing or unreadable.
 */
export async function loadIdeariosFromGists(): Promise<SavedIdeario[]> {
  const token = getToken();
  if (!token) return [];

  // Fast path: index-driven loading.
  let index: Awaited<ReturnType<typeof loadGistIndex>> = null;
  let indexed: SavedIdeario[] | null = null;
  try {
    index = await loadGistIndex(token);
    if (index && index.entries.length > 0) {
      const results = await Promise.all(
        index.entries.map((entry) => loadIdeaFromGist(token, entry.gist_id, entry.id))
      );
      indexed = results.filter((r): r is SavedIdeario => r !== null);
    }
  } catch {
    // Fall through to the full scan
  }

  // Fallback: no usable index — scan every Gist for Ideario YAML files.
  if (!indexed) {
    return scanGistsForIdeas(token);
  }

  // The index can be stale (ideas saved before the index existed are not
  // listed). Merge with a full scan, deduped by gist id, so pre-index ideas
  // are not hidden.
  const scanned = await scanGistsForIdeas(token);
  const seen = new Set(indexed.map((idea) => idea.gist_id));
  const merged = [...indexed];
  for (const idea of scanned) {
    if (!seen.has(idea.gist_id)) {
      merged.push(idea);
    }
  }

  // Opportunistically backfill the index with ideas the scan found but the
  // index doesn't know about. Best-effort — failures are fine.
  const indexedGistIds = new Set(index?.entries.map((e) => e.gist_id) ?? []);
  for (const idea of merged) {
    if (idea.gist_id && !indexedGistIds.has(idea.gist_id)) {
      addToGistIndex(token, {
        id: idea.id,
        gist_id: idea.gist_id,
        title: idea.title,
        created_at: idea.created_at,
      }).catch((error) => console.warn('Gist index backfill failed:', error));
    }
  }

  return merged;
}

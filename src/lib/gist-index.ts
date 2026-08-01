/**
 * Gist Vault Index — a single "ideario-index" Gist listing every idea Gist
 * ID, so loading the vault doesn't require paginating all user Gists.
 *
 * All operations are best-effort: callers must fall back gracefully when
 * the index is missing, stale, or the network fails.
 */

const GITHUB_API = 'https://api.github.com';

/** Description marker used to locate the index Gist. */
export const INDEX_GIST_DESCRIPTION = 'ideario-index';
const INDEX_FILENAME = 'ideario-index.json';

export interface GistIndexEntry {
  /** Local idea id (matches SavedIdeario.id). */
  id: string;
  /** Gist ID holding the idea YAML. */
  gist_id: string;
  title: string;
  created_at?: string;
}

export interface GistIndex {
  version: 1;
  entries: GistIndexEntry[];
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

interface GistListItem {
  id: string;
  description: string;
}

/** Locate the index Gist for this user. Returns null if none exists. */
async function findIndexGistId(token: string): Promise<string | null> {
  const response = await fetch(`${GITHUB_API}/gists?per_page=100`, { headers: headers(token) });
  if (!response.ok) return null;

  const gists = (await response.json()) as GistListItem[];
  const index = gists.find((g) => g.description === INDEX_GIST_DESCRIPTION);
  return index ? index.id : null;
}

function parseIndex(content: string): GistIndex | null {
  try {
    const data = JSON.parse(content) as Partial<GistIndex>;
    if (!Array.isArray(data.entries)) return null;
    return {
      version: 1,
      entries: data.entries
        .filter((e) => e && typeof e.gist_id === 'string')
        .map((e) => ({
          id: String(e.id || e.gist_id),
          gist_id: e.gist_id,
          title: String(e.title || 'Untitled'),
          created_at: e.created_at,
        })),
    };
  } catch {
    return null;
  }
}

/**
 * Load the index. Returns null when the index doesn't exist or can't be
 * read — callers should fall back to a full Gist scan.
 */
export async function loadGistIndex(token: string): Promise<GistIndex | null> {
  try {
    const gistId = await findIndexGistId(token);
    if (!gistId) return null;

    const response = await fetch(`${GITHUB_API}/gists/${gistId}`, { headers: headers(token) });
    if (!response.ok) return null;

    const gist = (await response.json()) as {
      files: Record<string, { content?: string; raw_url?: string; truncated?: boolean }>;
    };
    const file = gist.files[INDEX_FILENAME];
    if (!file) return null;

    let content = file.content;
    if (!content || file.truncated) {
      if (!file.raw_url) return null;
      content = await fetch(file.raw_url).then((r) => (r.ok ? r.text() : ''));
    }

    return content ? parseIndex(content) : null;
  } catch {
    return null;
  }
}

/**
 * Add an entry to the index Gist, creating the Gist if needed.
 * Throws on failure — callers should catch and continue (index is
 * rebuildable from a full scan).
 */
export async function addToGistIndex(token: string, entry: GistIndexEntry): Promise<void> {
  const existing = await loadGistIndex(token);
  const entries = [entry, ...(existing?.entries.filter((e) => e.gist_id !== entry.gist_id) ?? [])];
  const index: GistIndex = { version: 1, entries };

  const payload = {
    description: INDEX_GIST_DESCRIPTION,
    public: false,
    files: {
      [INDEX_FILENAME]: { content: JSON.stringify(index, null, 2) },
    },
  };

  const gistId = await findIndexGistId(token);
  const response = await fetch(gistId ? `${GITHUB_API}/gists/${gistId}` : `${GITHUB_API}/gists`, {
    method: gistId ? 'PATCH' : 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to update ideario index gist: ${response.status}`);
  }
}

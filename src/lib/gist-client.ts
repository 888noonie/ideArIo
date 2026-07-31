import type { SavedIdeario } from '../types/ideario';
import { parseIdearioYaml } from './yaml-builder';

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

function getToken(): string | null {
  return import.meta.env.VITE_GITHUB_TOKEN || null;
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
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub Gist failed: ${error}`);
  }

  const data = (await response.json()) as { id: string; html_url: string };
  return { gist_id: data.id, url: data.html_url };
}

export async function loadIdeariosFromGists(): Promise<SavedIdeario[]> {
  const token = getToken();
  if (!token) return [];

  const response = await fetch(`${GITHUB_API}/gists?per_page=100`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
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

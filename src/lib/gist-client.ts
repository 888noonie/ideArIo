import type { SavedIdeario } from '../types/ideario';

export function isGistSyncEnabled(): boolean {
  return import.meta.env.VITE_GIST_SYNC_ENABLED === 'true';
}

export async function saveIdearioToGist(
  ideario: SavedIdeario,
  yamlContent: string,
): Promise<{ gist_id: string; url: string }> {
  const response = await fetch('/api/gists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: ideario.id,
      title: ideario.title,
      category: ideario.category,
      tags: ideario.tags,
      createdAt: ideario.created_at,
      source: ideario.source,
      yamlContent,
    }),
  });

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok || !isGistResponse(data)) {
    const message = isErrorResponse(data) ? data.error : 'Gist sync failed';
    throw new Error(message);
  }

  return data;
}

function isGistResponse(value: unknown): value is { gist_id: string; url: string } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { gist_id?: unknown }).gist_id === 'string' &&
    typeof (value as { url?: unknown }).url === 'string',
  );
}

function isErrorResponse(value: unknown): value is { error: string } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { error?: unknown }).error === 'string',
  );
}

/**
 * Link queue: voice initiates ("open X in background" / "queue X"),
 * visual confirms later. Capped at 50 entries (oldest dropped).
 */

export interface QueuedLink {
  id: string;
  url: string;
  note?: string;
  ts: number;
}

const QUEUE_KEY = 'ideario-link-queue';
const MAX_LINKS = 50;

/**
 * Solid-enough URL matcher: scheme URLs plus bare domains
 * (example.com/path). Trailing punctuation is trimmed by the caller of
 * extractUrls via the regex itself not consuming it.
 */
const URL_PATTERN =
  /\b(?:https?:\/\/|www\.)[^\s<>"']+|(?:\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|org|net|io|dev|app|ai|co|me|info|edu|gov|xyz|site|cloud|tech)(?:\/[^\s<>"']*)?/gi;

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN) ?? [];
  return matches.map((raw) => {
    let url = raw.replace(/[.,;:!?)\]]+$/, '');
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }
    return url;
  });
}

export function loadQueue(): QueuedLink[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as QueuedLink[]).filter(
      (link) => link && typeof link.id === 'string' && typeof link.url === 'string'
    );
  } catch {
    return [];
  }
}

function saveQueue(links: QueuedLink[]): void {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(links.slice(-MAX_LINKS)));
  } catch {
    // storage unavailable — fail silently
  }
}

function createLinkId(): string {
  return `link-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function addToQueue(url: string, note?: string): QueuedLink[] {
  const links = loadQueue();
  const entry: QueuedLink = { id: createLinkId(), url, ts: Date.now() };
  if (note && note.trim()) entry.note = note.trim();
  links.push(entry);
  const capped = links.slice(-MAX_LINKS);
  saveQueue(capped);
  return capped;
}

export function removeFromQueue(id: string): QueuedLink[] {
  const links = loadQueue().filter((link) => link.id !== id);
  saveQueue(links);
  return links;
}

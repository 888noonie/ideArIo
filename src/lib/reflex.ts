/**
 * Reflex lane: pattern-matched local commands answered in <250ms,
 * BEFORE any LLM round-trip. The caller has already stripped the wake
 * word; matching is on the trimmed lowercase remainder. No match ->
 * { handled: false } and the input continues to the deliberation lane.
 *
 * The only network-adjacent reflex is "save this": confirmation is
 * returned instantly while the gist save continues in the background
 * inside ctx.saveLastExchange — we never await the network here.
 */

import type { TrustState } from './trust';
import { extractUrls } from './link-queue';

export interface ReflexContext {
  saveLastExchange: (tag?: string) => Promise<string>; // returns spoken confirmation
  queueLink: (url: string, note?: string) => string;
  setTrust: (t: TrustState) => string;
  stopSpeaking: () => boolean; // true if it was speaking
}

export interface ReflexResult {
  handled: boolean;
  response?: string;
}

// "save this [as <tag>]" | "tag this [as <tag>]"
const SAVE_PATTERN = /^(?:save|tag)\s+this(?:\s+as\s+(.+))?$/;
// "open <url> [in background]" | "queue <url>"
const LINK_PATTERN = /^(open|queue)\s+(.+?)(?:\s+in\s+(?:the\s+)?background)?$/;
const OPEN_TRUST_PATTERN = /^(?:i'm|im|i\s+am)\s+open$/;
const FOCUSED_TRUST_PATTERN = /^(?:i'm|im|i\s+am)\s+focused$/;
const STOP_PATTERN = /^(?:stop\s+talking|quiet|shush)$/;

export async function tryReflex(
  input: string,
  ctx: ReflexContext
): Promise<ReflexResult> {
  const text = input.trim().toLowerCase();
  if (!text) return { handled: false };

  const saveMatch = text.match(SAVE_PATTERN);
  if (saveMatch) {
    const tag = saveMatch[1]?.trim() || undefined;
    // Instant spoken confirmation; any network save keeps running async
    // behind ctx.saveLastExchange — the reflex lane never blocks on it.
    const response = await ctx.saveLastExchange(tag);
    return { handled: true, response };
  }

  if (OPEN_TRUST_PATTERN.test(text)) {
    return { handled: true, response: ctx.setTrust('co_pilot') };
  }

  if (FOCUSED_TRUST_PATTERN.test(text)) {
    return { handled: true, response: ctx.setTrust('suggest') };
  }

  if (STOP_PATTERN.test(text)) {
    const wasSpeaking = ctx.stopSpeaking();
    return {
      handled: true,
      response: wasSpeaking ? 'Okay, quiet now.' : 'I was not speaking.',
    };
  }

  const linkMatch = text.match(LINK_PATTERN);
  if (linkMatch) {
    const urls = extractUrls(linkMatch[2]);
    if (urls.length > 0) {
      return { handled: true, response: ctx.queueLink(urls[0]) };
    }
  }

  return { handled: false };
}

import type { AgentSpec } from './agents';

export interface RoutedPrompt {
  targets: AgentSpec[];
  cleanPrompt: string;   // wake word stripped
  broadcast: boolean;
}

const BROADCAST_PATTERN = /^hey\s+(everyone|everybody|all|crew)\b[,:!]?\s*/i;

/**
 * Match an agent wake word at the very start of the input.
 * Case-insensitive; tolerant of trailing punctuation (`,` `:` `!`) and of the
 * input being ONLY the wake word. Returns the remainder (possibly empty) or
 * null when the input does not start with this wake word.
 */
function matchWakeWord(input: string, wakeWord: string): string | null {
  const wake = wakeWord.trim().toLowerCase();
  if (!wake) return null;
  const lower = input.toLowerCase();
  if (!lower.startsWith(wake)) return null;

  // The character right after the wake word must not be a letter/digit,
  // so "Hey Kimiko" does not trigger the "Hey Kimi" agent.
  const next = input.charAt(wake.length);
  if (next && /[\p{L}\p{N}]/u.test(next)) return null;

  // Strip the wake word plus any immediately following punctuation/space.
  return input.slice(wake.length).replace(/^[,:!\s]+/, '');
}

export function routePrompt(
  input: string,
  agents: AgentSpec[],
  activeAgentId: string | null
): RoutedPrompt {
  const trimmed = input.trim();

  // 1. Explicit agent wake word -> that agent only.
  if (trimmed) {
    for (const agent of agents) {
      const remainder = matchWakeWord(trimmed, agent.wakeWord);
      if (remainder !== null) {
        return { targets: [agent], cleanPrompt: remainder, broadcast: false };
      }
    }

    // 2. Broadcast wake words -> all agents in parallel.
    const broadcastMatch = trimmed.match(BROADCAST_PATTERN);
    if (broadcastMatch) {
      return {
        targets: agents,
        cleanPrompt: trimmed.slice(broadcastMatch[0].length),
        broadcast: true,
      };
    }
  }

  // 3. Fallback -> active agent (or the first agent).
  const fallback = agents.find((a) => a.id === activeAgentId) ?? agents[0];
  return {
    targets: fallback ? [fallback] : [],
    cleanPrompt: trimmed,
    broadcast: false,
  };
}

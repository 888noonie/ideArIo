/**
 * Crew audio: speech synthesis for agent replies plus an honest
 * MediaSession anchor so the phone's own audio controls (lock screen,
 * headset buttons) can pause/stop/skip the crew's voice. Disabled by
 * default — the crew never speaks until the user opts in.
 */

const ENABLED_KEY = 'ideario-crew-audio';
const CHUNK_MAX = 200;

export function isCrewAudioEnabled(): boolean {
  try {
    return window.localStorage.getItem(ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setCrewAudioEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(ENABLED_KEY, on ? 'true' : 'false');
  } catch {
    // storage unavailable — fail silently
  }
}

let lastReply: string | null = null;
let initialized = false;

export function isSpeaking(): boolean {
  try {
    return 'speechSynthesis' in window && window.speechSynthesis.speaking;
  } catch {
    return false;
  }
}

/** Stop any in-flight crew speech. Returns true if it was speaking. */
export function stopSpeaking(): boolean {
  const was = isSpeaking();
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // speech unavailable — fail silently
  }
  return was;
}

/** Split text into speakable chunks on sentence boundaries, <=200 chars. */
function chunkSentences(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && (current + sentence).length > CHUNK_MAX) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
    // A single sentence longer than the cap is hard-split.
    while (current.length > CHUNK_MAX) {
      chunks.push(current.slice(0, CHUNK_MAX).trim());
      current = current.slice(CHUNK_MAX);
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

/** Speak an agent reply aloud. No-op when crew audio is disabled. */
export function speakAgentReply(text: string): void {
  if (!isCrewAudioEnabled()) return;
  if (!('speechSynthesis' in window)) return;
  const trimmed = text.trim();
  if (!trimmed) return;

  lastReply = trimmed;
  try {
    window.speechSynthesis.cancel(); // never stack utterances
    for (const chunk of chunkSentences(trimmed)) {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  } catch {
    // speech unavailable — fail silently
  }
}

/**
 * Wire MediaSession metadata + action handlers. No-op when unsupported.
 * Handlers: pause/stop/nexttrack -> stopSpeaking; previoustrack ->
 * repeat the last reply.
 */
export function initCrewAudio(): void {
  if (initialized) return;
  if (!('mediaSession' in navigator)) return;
  initialized = true;

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Ideario Crew',
      artist: 'The Crew',
    });

    const guard = (handler: (() => void) | null) => {
      try {
        return handler;
      } catch {
        return null;
      }
    };

    navigator.mediaSession.setActionHandler('pause', guard(() => stopSpeaking()));
    navigator.mediaSession.setActionHandler('stop', guard(() => stopSpeaking()));
    navigator.mediaSession.setActionHandler(
      'nexttrack',
      guard(() => stopSpeaking())
    );
    navigator.mediaSession.setActionHandler(
      'previoustrack',
      guard(() => {
        if (lastReply) speakAgentReply(lastReply);
      })
    );
  } catch {
    // MediaSession unavailable or blocked — fail silently
  }
}

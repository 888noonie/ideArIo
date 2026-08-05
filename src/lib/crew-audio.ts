/**
 * Crew audio: speech synthesis for agent replies plus an honest
 * MediaSession anchor so the phone's own audio controls (lock screen,
 * headset buttons) can pause/stop/skip the crew's voice. Disabled by
 * default — the crew never speaks until the user opts in.
 */
import { loadSpeechSettings } from './speech-settings';
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

// F-13: crew speech is serialized through a FIFO queue. Previously each
// speakAgentReply call did speechSynthesis.cancel() then re-queued its own
// chunks, so a broadcast ("Hey everyone") where several agents finish in the
// same tick would have each later agent's cancel() interrupt the previous
// speaker mid-sentence — only the last-finishing agent was heard in full.
// Now replies are spoken one at a time, advancing on utterance end.
const replyQueue: string[] = [];
let queueActive = false;

export function isSpeaking(): boolean {
  try {
    return 'speechSynthesis' in window && window.speechSynthesis.speaking;
  } catch {
    return false;
  }
}

/** Stop any in-flight crew speech and clear the pending queue. */
export function stopSpeaking(): boolean {
  const was = isSpeaking();
  replyQueue.length = 0;
  queueActive = false;
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

/** Speak the next queued reply (if any). Called when the queue is idle. */
function pumpQueue(settings?: { rate?: number }): void {
  if (queueActive) return;
  const next = replyQueue.shift();
  if (next === undefined) return;
  queueActive = true;

  const chunks = chunkSentences(next).slice(0, 3);
  if (chunks.length === 0) {
    queueActive = false;
    pumpQueue(settings);
    return;
  }

  try {
    const synth = window.speechSynthesis;
    // Speak all chunks of this reply; the LAST chunk's onend advances the
    // queue to the next reply (or marks the queue idle).
    chunks.forEach((chunk, i) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.rate = settings?.rate ?? 1.0;
      if (i === chunks.length - 1) {
        utterance.onend = () => {
          queueActive = false;
          pumpQueue(settings);
        };
        utterance.onerror = () => {
          queueActive = false;
          pumpQueue(settings);
        };
      }
      synth.speak(utterance);
    });
  } catch {
    // speech unavailable — fail silently, move on
    queueActive = false;
    pumpQueue(settings);
  }
}

/** Speak an agent reply aloud. No-op when crew audio is disabled. */
export function speakAgentReply(text: string): void {
  if (!isCrewAudioEnabled()) return;
  if (!('speechSynthesis' in window)) return;
  const trimmed = text.trim();
  if (!trimmed) return;

  const settings = loadSpeechSettings();
  lastReply = trimmed;
  replyQueue.push(trimmed);
  pumpQueue(settings);
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
        if (lastReply) {
          stopSpeaking(); // clear the queue, then replay the last reply
          speakAgentReply(lastReply);
        }
      })
    );
  } catch {
    // MediaSession unavailable or blocked — fail silently
  }
}

import { useState, useCallback, useEffect, useRef } from 'react';
import type { SpeechSynthesisHook, ArioCue } from '../types/ideario';

const CUES: Record<ArioCue, string> = {
  wake: 'Hey there, I am Ario. How can I help you capture your idea?',
  listening: 'Listening',
  processing: 'Processing your idea',
  saved: 'Idea saved to your vault',
  error: 'Something went wrong, but I saved it locally',
  synced: 'Back online, ideas synchronized',
  offline: 'Connection interrupted, saving locally',
  online: 'Connection restored',
};

/** Consecutive engine errors before we declare TTS unavailable and
 *  switch the UI to persistent visual feedback. */
const MAX_TTS_FAILURES = 2;

/** How long a subtitle stays on screen when audio feedback works. */
const CUE_VISIBLE_MS = 4000;

export function useSpeechSynthesis(): SpeechSynthesisHook {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);
  const [ttsAvailable, setTtsAvailable] = useState(true);
  const [lastCue, setLastCue] = useState<{ text: string; ts: number } | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const supportedRef = useRef(true);
  // Keep a reference to the in-flight utterance: Chrome/WebView can
  // garbage-collect it mid-speech and cut the audio off.
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const failCountRef = useRef(0);
  const clearTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setSupported(false);
      supportedRef.current = false;
      setTtsAvailable(false);
      return;
    }

    const selectVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      // Prefer a calm, clear English voice. Some WebViews never return
      // any voices — speech often still works with the default voice,
      // so an empty list is not fatal.
      const preferred =
        voices.find((v) => v.name.includes('Google UK English Male')) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        voices.find((v) => v.default) ||
        voices[0];
      voiceRef.current = preferred || null;
    };

    selectVoice();
    window.speechSynthesis.onvoiceschanged = selectVoice;
  }, []);

  // Gesture unlock: Android WebView / Chrome keep speechSynthesis paused
  // until a user gesture. On the first tap anywhere, resume the engine and
  // push a near-silent stub utterance through it inside the gesture.
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const unlock = () => {
      try {
        window.speechSynthesis.resume();
        const stub = new SpeechSynthesisUtterance(' ');
        stub.volume = 0.01;
        window.speechSynthesis.speak(stub);
      } catch {
        // Engine missing entirely — speak() will degrade to subtitles.
      }
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // Auto-clear the subtitle after a few seconds — but only when audio
  // feedback works. In silent mode the text IS the feedback, so it stays.
  useEffect(() => {
    if (!lastCue || !ttsAvailable) return;
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    clearTimerRef.current = window.setTimeout(() => setLastCue(null), CUE_VISIBLE_MS);
    return () => {
      if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    };
  }, [lastCue, ttsAvailable]);

  const speak = useCallback((text: string, priority: 'critical' | 'normal' | 'silent' = 'normal') => {
    // Always record the cue for visual feedback, even when silent/muted.
    setLastCue({ text, ts: Date.now() });

    if (!supportedRef.current || priority === 'silent') return;
    if (!('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.resume();
    } catch {
      // ignore
    }

    const doSpeak = () => {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = voiceRef.current;
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        utterance.volume = priority === 'critical' ? 1.0 : 0.8;
        utterRef.current = utterance;

        utterance.onstart = () => {
          setSpeaking(true);
          failCountRef.current = 0;
        };
        utterance.onend = () => {
          setSpeaking(false);
          if (utterRef.current === utterance) utterRef.current = null;
        };
        utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
          setSpeaking(false);
          if (utterRef.current === utterance) utterRef.current = null;
          // 'canceled'/'interrupted' come from our own cancel() — not failures.
          if (event.error && event.error !== 'canceled' && event.error !== 'interrupted') {
            failCountRef.current += 1;
            if (failCountRef.current >= MAX_TTS_FAILURES) {
              setTtsAvailable(false);
            }
          }
        };

        window.speechSynthesis.speak(utterance);
      } catch {
        failCountRef.current += 1;
        if (failCountRef.current >= MAX_TTS_FAILURES) {
          setTtsAvailable(false);
        }
      }
    };

    if (priority === 'critical') {
      // Chrome/WebView bug: speak() immediately after cancel() can swallow
      // the utterance. Cancel, then speak on a short delay.
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
      window.setTimeout(doSpeak, 60);
    } else {
      doSpeak();
    }
  }, []);

  const cue = useCallback((type: ArioCue) => {
    speak(CUES[type], 'critical');
  }, [speak]);

  return { speak, cue, speaking, supported, lastCue, ttsAvailable };
}

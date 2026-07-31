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

export function useSpeechSynthesis(): SpeechSynthesisHook {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (!('speechSynthesis' in window)) {
      setSupported(false);
      return;
    }

    const selectVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      // Prefer a calm, clear English voice
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

  const speak = useCallback((text: string, priority: 'critical' | 'normal' | 'silent' = 'normal') => {
    if (!supported || priority === 'silent') return;
    if (!('speechSynthesis' in window)) return;

    // Cancel any current speech for critical messages
    if (priority === 'critical') {
      window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voiceRef.current;
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = priority === 'critical' ? 0.9 : 0.7;

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [supported]);

  const cue = useCallback((type: ArioCue) => {
    speak(CUES[type], 'critical');
  }, [speak]);

  return { speak, cue, speaking, supported };
}

import { useState, useRef, useCallback, useEffect } from 'react';
import type { SpeechRecognitionHook, SpeechRecognitionOptions } from '../types/ideario';

// Extend Window interface for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionType extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionType;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const DEFAULT_WATCHDOG_MS = 7000;

// Errors that are recoverable / expected on mobile and should NOT be treated
// as hard failures. Everything else (not-allowed, audio-capture, network,
// service-not-allowed, ...) is surfaced to the caller.
const SILENT_ERRORS = new Set(['aborted']);

export function useSpeechRecognition(options?: SpeechRecognitionOptions): SpeechRecognitionHook {
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noSpeech, setNoSpeech] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionType | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hadResultRef = useRef(false);

  const continuous = options?.continuous ?? false;
  const lang = options?.lang ?? 'en-US';
  const interimResults = options?.interimResults ?? true;
  const watchdogMs = options?.watchdogMs ?? DEFAULT_WATCHDOG_MS;

  // Keep latest callbacks in a ref so the recognition instance never goes stale.
  const callbacksRef = useRef(options);
  useEffect(() => {
    callbacksRef.current = options;
  });

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const armWatchdog = useCallback(() => {
    clearWatchdog();
    if (watchdogMs <= 0) return;
    watchdogRef.current = setTimeout(() => {
      // No interim or final result within the watchdog window. On mobile this
      // usually means the speech service is unreachable or the mic is dead —
      // stop gracefully and surface a recoverable no-speech state.
      hadResultRef.current = false;
      try {
        recognitionRef.current?.stop();
      } catch {
        // Already stopped
      }
      setNoSpeech(true);
      callbacksRef.current?.onNoSpeech?.();
    }, watchdogMs);
  }, [watchdogMs, clearWatchdog]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      setError('Speech recognition not supported in this browser');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = interimResults;
    recognition.continuous = continuous;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      hadResultRef.current = false;
      armWatchdog();
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      hadResultRef.current = true;
      armWatchdog(); // reset watchdog while speech is flowing

      let final = '';
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (final) {
        setTranscript((prev) => (prev ? prev + ' ' + final : final));
      }
      setInterimTranscript(interim);
      callbacksRef.current?.onResult?.(final, interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      clearWatchdog();
      if (event.error === 'no-speech') {
        // Gentle, recoverable: surface it instead of silently swallowing.
        hadResultRef.current = false;
        setNoSpeech(true);
        callbacksRef.current?.onNoSpeech?.();
        return;
      }
      if (SILENT_ERRORS.has(event.error)) return;
      setError(event.error);
      setIsListening(false);
      callbacksRef.current?.onFatalError?.(event.error);
    };

    recognition.onend = () => {
      clearWatchdog();
      setIsListening(false);
      setInterimTranscript('');
      callbacksRef.current?.onSessionEnd?.(hadResultRef.current);
    };

    recognitionRef.current = recognition;

    return () => {
      clearWatchdog();
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    };
  }, [continuous, lang, interimResults, armWatchdog, clearWatchdog]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    setError(null);
    setNoSpeech(false);
    setTranscript('');
    setInterimTranscript('');
    hadResultRef.current = false;
    try {
      recognitionRef.current.start();
    } catch {
      // Already started
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    clearWatchdog();
    try {
      recognitionRef.current.stop();
    } catch {
      // Already stopped
    }
  }, [clearWatchdog]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  const clearNoSpeech = useCallback(() => {
    setNoSpeech(false);
  }, []);

  return {
    transcript,
    interimTranscript,
    isListening,
    error,
    noSpeech,
    clearNoSpeech,
    startListening,
    stopListening,
    resetTranscript,
    supported,
  };
}

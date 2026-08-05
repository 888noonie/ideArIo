import { useState, useRef, useCallback, useEffect } from 'react';
import { useSpeechRecognition } from './useSpeechRecognition';

/** Matches "hey ario" / "ario" as a word, capturing whatever follows it. */
const WAKE_REGEX = /(?:^|\s)hey[\s,]+ario\b[\s,:-]*|(?:^|\s)ario\b[\s,:-]*/i;
/** Pause wake mode after this much silence (spec: 30s). */
const SILENCE_PAUSE_MS = 30_000;
/** After hearing just "Ario", wait this long for the command sentence. */
const WAKE_WINDOW_MS = 4_000;
const MIN_COMMAND_LENGTH = 4;
/** Delay before auto-restarting recognition after the OS kills it. */
const RESTART_DELAY_MS = 350;
/** Stop auto-restarting after this many consecutive fatal errors. */
const MAX_FATAL_ERRORS = 2;

export interface UseWakeWordOptions {
  /** Master switch — wake mode only runs while true. */
  enabled: boolean;
  /** Fired once with the sentence captured after the wake phrase. */
  onCommand: (text: string) => void;
  /** Fired when wake mode auto-pauses after 30s of silence. */
  onAutoPause?: () => void;
  /** Fired when a wake-word command is confirmed and about to process. */
  onWakeConfirmed?: () => void;
  /** Fired when wake mode is force-disabled (repeated mic/permission errors). */
  onDisabled?: (reason: string) => void;
}

export interface WakeWordHook {
  /** True while actively listening for the wake phrase. */
  listening: boolean;
  /** True when auto-paused after silence (call resume() to continue). */
  paused: boolean;
  supported: boolean;
  error: string | null;
  /** Resume wake listening after a pause or after processing a command. */
  resume: () => void;
  /** Manually pause wake listening (mic off, mode stays enabled). */
  pause: () => void;
}

export function useWakeWord({ enabled, onCommand, onAutoPause, onWakeConfirmed, onDisabled }: UseWakeWordOptions): WakeWordHook {
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabledRef = useRef(enabled);
  const pausedRef = useRef(false);
  /** True while a captured command is being processed — blocks auto-restart. */
  const processingRef = useRef(false);
  /** Timestamp of hearing a bare "Ario" with no trailing sentence. */
  const awokenAtRef = useRef(0);
  const fatalCountRef = useRef(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const callbacksRef = useRef({ onCommand, onAutoPause, onWakeConfirmed, onDisabled });
  useEffect(() => {
    callbacksRef.current = { onCommand, onAutoPause, onWakeConfirmed, onDisabled };
  });

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const armSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      if (!enabledRef.current || processingRef.current) return;
      pausedRef.current = true;
      setPaused(true);
      recognitionRef.current.stopListening();
      callbacksRef.current.onAutoPause?.();
    }, SILENCE_PAUSE_MS);
  }, [clearSilenceTimer]);

  const fireCommand = useCallback((text: string) => {
    const cleaned = text.trim();
    if (cleaned.length < 2) return;
    processingRef.current = true;
    awokenAtRef.current = 0;
    clearSilenceTimer();
    recognitionRef.current.stopListening();
    callbacksRef.current.onCommand(cleaned);
  }, [clearSilenceTimer]);

  const handleResult = useCallback((finalChunk: string, interim: string) => {
    // Any audible result resets the silence auto-pause timer.
    armSilenceTimer();

    const text = finalChunk || interim;
    if (!text) return;

    // Case 1: "Ario" was heard recently on its own — this chunk is the command.
    if (awokenAtRef.current > 0) {
      if (Date.now() - awokenAtRef.current <= WAKE_WINDOW_MS) {
        // Only commit on final results so we capture the full sentence.
        if (finalChunk) {
          fireCommand(finalChunk);
        }
        return;
      }
      awokenAtRef.current = 0;
    }

    // Case 2: wake phrase inside this chunk.
    const match = WAKE_REGEX.exec(text);
    if (match) {
      const remainder = text.slice(match.index + match[0].length).trim();
      if (remainder.length >= MIN_COMMAND_LENGTH) {
        if (finalChunk) {
          callbacksRef.current.onWakeConfirmed?.();
          fireCommand(remainder);
        }
        // On interim-only matches, wait for the final to capture it fully.
      } else if (remainder.length > 0) {
        // Too-short follow-up: don't trigger on false partial fragments.
        return;
      } else {
        // Bare "Ario" — open the command window.
        awokenAtRef.current = Date.now();
      }
    }
  }, [armSilenceTimer, fireCommand]);

  const handleSessionEnd = useCallback(() => {
    // Mobile browsers kill continuous recognition frequently — auto-restart
    // while wake mode is on, unless we're paused or processing a command.
    if (!enabledRef.current || pausedRef.current || processingRef.current) return;
    if (fatalCountRef.current >= MAX_FATAL_ERRORS) return;
    clearRestartTimer();
    restartTimerRef.current = setTimeout(() => {
      if (enabledRef.current && !pausedRef.current && !processingRef.current) {
        recognitionRef.current.startListening();
        armSilenceTimer();
      }
    }, RESTART_DELAY_MS);
  }, [armSilenceTimer, clearRestartTimer]);

  const handleFatalError = useCallback((err: string) => {
    setError(err);
    // Count ALL fatal (non-no-speech) errors toward the auto-disable
    // threshold — persistent soft errors (e.g. `network` on Android Chrome
    // with a dead speech service) would otherwise restart every 350ms forever.
    fatalCountRef.current += 1;
    if (fatalCountRef.current >= MAX_FATAL_ERRORS) {
      enabledRef.current = false;
      pausedRef.current = false;
      setPaused(false);
      clearSilenceTimer();
      clearRestartTimer();
      recognitionRef.current.stopListening();
      callbacksRef.current.onDisabled?.(err);
    }
  }, [clearSilenceTimer, clearRestartTimer]);

  const recognitionRef = useRef<ReturnType<typeof useSpeechRecognition>>(null as never);

  const recognition = useSpeechRecognition({
    continuous: true,
    watchdogMs: 0, // wake mode manages its own silence timer
    onResult: handleResult,
    onSessionEnd: handleSessionEnd,
    onFatalError: handleFatalError,
  });
  recognitionRef.current = recognition;

  // Start/stop with the enabled flag.
  useEffect(() => {
    enabledRef.current = enabled;
    if (enabled) {
      fatalCountRef.current = 0;
      processingRef.current = false;
      pausedRef.current = false;
      awokenAtRef.current = 0;
      setPaused(false);
      setError(null);
      recognition.startListening();
      armSilenceTimer();
    } else {
      clearSilenceTimer();
      clearRestartTimer();
      processingRef.current = false;
      pausedRef.current = false;
      awokenAtRef.current = 0;
      setPaused(false);
      recognition.stopListening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      clearSilenceTimer();
      clearRestartTimer();
    };
  }, [clearSilenceTimer, clearRestartTimer]);

  const resume = useCallback(() => {
    processingRef.current = false;
    pausedRef.current = false;
    awokenAtRef.current = 0;
    setPaused(false);
    if (enabledRef.current) {
      recognitionRef.current.startListening();
      armSilenceTimer();
    }
  }, [armSilenceTimer]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    setPaused(true);
    clearSilenceTimer();
    clearRestartTimer();
    recognitionRef.current.stopListening();
  }, [clearSilenceTimer, clearRestartTimer]);

  return {
    listening: recognition.isListening,
    paused,
    supported: recognition.supported,
    error,
    resume,
    pause,
  };
}

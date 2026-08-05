import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { StatusBar } from './components/StatusBar';
import { DebugOverlay } from './components/DebugOverlay';
import { TabBar, type TabId } from './components/TabBar';
import { VoiceChatTab } from './components/VoiceChatTab';
import { IdeasTab } from './components/IdeasTab';
import { HistoryTab } from './components/HistoryTab';
import { BridgeTab } from './components/BridgeTab';
import { AgentManager } from './components/AgentManager';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis';
import { useWakeWord } from './hooks/useWakeWord';
import { describeProcessingError } from './lib/nim-proxy';
import { serializeIdearioYaml } from './lib/yaml-builder';
import { saveIdearioToGist } from './lib/gist-client';
import { loadFromLocalDB, markAsSynced } from './lib/storage';
import {
  loadSelectedModelId,
  saveSelectedModelId,
} from './lib/model-id';
import { loadTheme, saveTheme, applyTheme, type Theme } from './lib/theme';
import { loadAgents, saveAgents, DEFAULT_AGENTS, type AgentSpec } from './lib/agents';
import { CHAT_SYSTEM_ENTRY_EVENT } from './lib/chat-engine';
import { initSettingsSyncListener, takePendingSettings, type SyncedSettings } from './lib/settings-sync';
import { SettingsSyncPrompt } from './components/SettingsSyncPrompt';
import type { ArioState, IdearioYAML, SavedIdeario } from './types/ideario';
import type { ModelInfo } from './lib/model-registry';

// Lazy-load the Settings tab so the 790-line model registry (pulled in via
// ModelSelector) stays out of the initial bundle.
const SettingsPanel = lazy(() =>
  import('./components/SettingsPanel').then((m) => ({ default: m.SettingsPanel }))
);

const WAKE_MODE_KEY = 'ideario-wake-mode';
const PAIRED_KEY = 'ideario-paired';

function loadWakeMode(): boolean {
  try {
    return localStorage.getItem(WAKE_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}

function loadPaired(): boolean {
  try {
    return localStorage.getItem(PAIRED_KEY) === 'true';
  } catch {
    return false;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('voice');
  const [arioState, setArioState] = useState<ArioState>('idle');
  const [ideario, setIdeario] = useState<IdearioYAML | null>(null);
  const [savedIdeas, setSavedIdeas] = useState<SavedIdeario[]>([]);
  const [online, setOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending'>('synced');
  const [selectedModelId, setSelectedModelId] = useState<string>(loadSelectedModelId);
  const [wakeMode, setWakeMode] = useState<boolean>(loadWakeMode);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [showDebug, setShowDebug] = useState(false);
  const [agents, setAgents] = useState<AgentSpec[]>(loadAgents);
  const [paired, setPaired] = useState<boolean>(loadPaired);
  const [pendingSync, setPendingSync] = useState<SyncedSettings | null>(null);

  // The Voice Chat tab registers ChatPanel's send path here; finalized
  // voice transcripts flow through it (reflex lane FIRST, then dispatch)
  // exactly as if typed.
  const chatSendRef = useRef<((text: string) => Promise<void>) | null>(null);
  const handleSendReady = useCallback((send: (text: string) => Promise<void>) => {
    chatSendRef.current = send;
  }, []);

  // Persist paired mode (toggled from the Bridge tab).
  useEffect(() => {
    try {
      localStorage.setItem(PAIRED_KEY, String(paired));
    } catch {
      // Ignore localStorage errors
    }
  }, [paired]);

  // Lock the shell height ONCE on load: the AA WebView fires viewport
  // resize jitter (keyboard, browser chrome) that used to bounce the
  // layout. --app-h is intentionally NOT updated on resize/orientation.
  useEffect(() => {
    document.documentElement.style.setProperty('--app-h', `${window.innerHeight}px`);
  }, []);

  const {
    transcript,
    interimTranscript,
    isListening,
    error: speechError,
    noSpeech,
    clearNoSpeech,
    startListening,
    stopListening,
    resetTranscript,
    supported: speechSupported,
  } = useSpeechRecognition();

  const { cue, speak, lastCue, ttsAvailable } = useSpeechSynthesis();
  const processingRef = useRef(false);

  // Wake mode can't run without speech recognition.
  useEffect(() => {
    if (!speechSupported) {
      setWakeMode(false);
    }
  }, [speechSupported]);

  // ----- Wake word ("Hey Ario") -----
  const wakeModeRef = useRef(wakeMode);
  useEffect(() => {
    wakeModeRef.current = wakeMode;
    try {
      localStorage.setItem(WAKE_MODE_KEY, String(wakeMode));
    } catch {
      // Ignore localStorage errors
    }
  }, [wakeMode]);

  // Defined after handleSpeechFinalized below via ref to avoid circular deps.
  const processCommandRef = useRef<(text: string) => void>(() => {});

  const wake = useWakeWord({
    enabled: wakeMode && speechSupported,
    onCommand: useCallback((text: string) => {
      processCommandRef.current(text);
    }, []),
    onAutoPause: useCallback(() => {
      speak('Wake mode paused after silence. Tap the mic to resume.', 'normal');
    }, [speak]),
    onWakeConfirmed: useCallback(() => {
      cue('confirm');
    }, [cue]),
    onDisabled: useCallback((reason: string) => {
      setWakeMode(false);
      setArioState('error');
      speak(`Wake mode turned off: microphone error (${reason}). Tap to use voice manually, or type instead.`, 'critical');
    }, [speak]),
  });

  // Load saved ideas on mount
  useEffect(() => {
    loadFromLocalDB()
      .then((ideas) => setSavedIdeas(ideas))
      .catch(() => setSavedIdeas([]));
  }, []);

  // Settings sync (F2/A4 + S-03): display role STAGES hub-pushed settings and
  // shows a prompt; nothing is written until the user explicitly accepts.
  // Display never echoes settings back.
  const applySyncedSettings = useCallback((s: SyncedSettings) => {
    try {
      for (const [providerId, key] of Object.entries(s.providerKeys ?? {})) {
        localStorage.setItem(`ideario-key-${providerId}`, key);
      }
      if (typeof s.ollamaBaseUrl === 'string') {
        localStorage.setItem('ideario-ollama-url', s.ollamaBaseUrl);
      }
    } catch {
      // Ignore localStorage errors
    }
    if (Array.isArray(s.agents) && s.agents.length > 0) {
      saveAgents(s.agents);
      setAgents(s.agents);
    }
    if (s.theme === 'light' || s.theme === 'dark') {
      applyTheme(s.theme);
      saveTheme(s.theme);
      setTheme(s.theme);
    }
    if (typeof s.selectedModelId === 'string' && s.selectedModelId) {
      saveSelectedModelId(s.selectedModelId);
      setSelectedModelId(s.selectedModelId);
    }
    // Single write path: ping the always-mounted chat panel via the window
    // event; it appends the entry and persists through its normal save
    // effect. (A direct saveChatLog here raced that effect — F-07.)
    window.dispatchEvent(
      new CustomEvent(CHAT_SYSTEM_ENTRY_EVENT, { detail: 'Settings synced from hub' })
    );
  }, []);

  useEffect(() => {
    initSettingsSyncListener((s: SyncedSettings) => {
      setPendingSync(s); // stage only — no writes until Accept
    });
  }, []);

  const handleSyncAccept = useCallback(() => {
    const s = takePendingSettings();
    if (s) applySyncedSettings(s);
    setPendingSync(null);
  }, [applySyncedSettings]);

  const handleSyncDecline = useCallback(() => {
    takePendingSettings(); // discard
    setPendingSync(null);
  }, []);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      cue('online');
      syncPendingIdeas();
    };
    const handleOffline = () => {
      setOnline(false);
      cue('offline');
    };

    setOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [cue]);

  // Sync state when listening stops with a transcript
  useEffect(() => {
    if (!isListening && transcript && !processingRef.current) {
      handleSpeechFinalized(transcript);
    }
  }, [isListening, transcript]);

  // Mobile fix: if recognition ends with NO transcript and NO error
  // (silence, mobile speech-service hiccup), never leave the mic stuck
  // in "listening" — reset to idle. The reset must only fire on a genuine
  // listening→ended transition: `startListening()` is async, so there is a
  // start-up window between the tap (state set to 'listening') and the
  // recognition `onstart` where `isListening` is still false. Tracking
  // `wasListeningRef` keeps the mic in 'listening' through that window.
  const wasListeningRef = useRef(false);
  useEffect(() => {
    if (isListening) {
      wasListeningRef.current = true;
      return;
    }
    if (wasListeningRef.current && !transcript && arioState === 'listening' && !processingRef.current) {
      setArioState('idle');
    }
    wasListeningRef.current = false;
  }, [isListening, transcript, arioState]);

  // Surface no-speech (error event or 7s watchdog) as a gentle,
  // recoverable state with voice + visual feedback.
  const speechCaptureErrorStreak = useRef(0);

  const speakCaptureIssue = useCallback(
    (fallback: string) => {
      speechCaptureErrorStreak.current += 1;
      if (speechCaptureErrorStreak.current === 2) {
        speak('Mic is struggling. Typing works too.', 'critical');
      } else if (speechCaptureErrorStreak.current < 2) {
        speak(fallback, 'critical');
      }
    },
    [speak]
  );

  useEffect(() => {
    if (noSpeech) {
      clearNoSpeech();
      setArioState((prev) => (prev === 'thinking' ? prev : 'idle'));
      speakCaptureIssue("I didn't hear anything — tap and try again, or type instead.");
    }
  }, [noSpeech, clearNoSpeech, speakCaptureIssue]);

  const handleSpeechFinalized = useCallback(async (finalTranscript: string) => {
    if (!finalTranscript.trim()) return;

    speechCaptureErrorStreak.current = 0;
    processingRef.current = true;
    setArioState('thinking');
    cue('processing');

    try {
      const send = chatSendRef.current;
      if (!send) {
        // VoiceChatTab stays mounted, so this should never happen — log
        // instead of faking success.
        console.warn('Voice Chat send path not registered; transcript dropped.');
        setArioState('idle');
        return;
      }
      // Reflex lane runs FIRST inside ChatPanel's send path, then the
      // transcript dispatches to the agents exactly as if typed.
      await send(finalTranscript);
      cue('saved');
      setArioState('idle');
    } catch (error) {
      console.error('Voice dispatch failed:', error);
      cue('error');
      setArioState('error');
      speak(describeProcessingError(error), 'critical');
    } finally {
      processingRef.current = false;
      resetTranscript();
      // In wake mode, return to listening for "Hey Ario".
      if (wakeModeRef.current) {
        wake.resume();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue, resetTranscript, speak]);

  // Keep the wake-word command handler pointing at the latest
  // handleSpeechFinalized — assigned in an effect, not during render.
  useEffect(() => {
    processCommandRef.current = (text: string) => {
      void handleSpeechFinalized(text);
    };
  }, [handleSpeechFinalized]);

  const handleActivate = useCallback(() => {
    if (arioState === 'thinking') return;

    // In wake mode the mic toggles wake pause/resume instead of a
    // one-shot recording session.
    if (wakeMode) {
      if (wake.paused) {
        wake.resume();
        cue('wake');
      } else {
        wake.pause();
        speak('Wake mode paused. Tap the mic to resume.', 'normal');
      }
      return;
    }

    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      setArioState('listening');
      cue('listening');
      startListening();
    }
  }, [arioState, wakeMode, wake, isListening, startListening, stopListening, resetTranscript, cue, speak]);

  const handleToggleWakeMode = useCallback(() => {
    setWakeMode((prev) => {
      const next = !prev;
      if (next) {
        resetTranscript();
        setArioState('idle');
        cue('wake');
      } else {
        setArioState('idle');
        speak('Wake mode off.', 'normal');
      }
      return next;
    });
  }, [cue, resetTranscript, speak]);

  const syncPendingIdeas = useCallback(async () => {
    const pending = savedIdeas.filter((i) => !i.synced);
    if (pending.length === 0) return;

    for (const idea of pending) {
      try {
        const yamlString = serializeIdearioYaml(idea);
        const { gist_id } = await saveIdearioToGist(idea, yamlString);
        await markAsSynced(idea.id, gist_id);
        idea.gist_id = gist_id;
        idea.synced = true;
      } catch (error) {
        console.warn('Failed to sync idea:', idea.id, error);
      }
    }

    setSavedIdeas([...savedIdeas]);
    setSyncStatus('synced');
  }, [savedIdeas]);

  const handleModelChange = useCallback((model: ModelInfo) => {
    setSelectedModelId(model.id);
    saveSelectedModelId(model.id);
    speak(`Switched to ${model.name}`, 'normal');
  }, [speak]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'light' ? 'dark' : 'light';
      applyTheme(next);
      saveTheme(next);
      return next;
    });
  }, []);

  const handleToggleDebug = useCallback(() => {
    setShowDebug((prev) => !prev);
  }, []);

  const handleResetAgents = useCallback(() => {
    const defaults = DEFAULT_AGENTS.map((a) => ({ ...a }));
    saveAgents(defaults);
    setAgents(defaults);
    speak('Agents reset to defaults.', 'normal');
  }, [speak]);

  const handleOpenIdea = useCallback((idea: SavedIdeario) => {
    setIdeario(idea);
  }, []);

  const handleReflexResponse = useCallback((text: string) => {
    speak(text, 'normal');
  }, [speak]);

  // Apply persisted theme on mount (main.tsx also applies pre-paint).
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Handle speech errors (unsupported browsers degrade to typed chat
  // instead of nagging the user on load).
  useEffect(() => {
    if (speechError && speechSupported) {
      setArioState('error');
      speakCaptureIssue('I did not catch that. Please try again.');
    }
  }, [speechError, speechSupported, speakCaptureIssue]);

  const allSynced = savedIdeas.length === 0 || savedIdeas.every((i) => i.synced);

  return (
    <div className={`ario-shell bg-ario-dark overflow-hidden ${paired ? 'paired-mode' : ''}`}>
      <div className="h-full w-full flex flex-col bg-ario-dark rounded-2xl overflow-hidden border border-white/5 shadow-2xl">
        {/* Slim status strip */}
        <StatusBar
          online={online}
          synced={allSynced && syncStatus === 'synced'}
          ideaCount={savedIdeas.length}
          paired={paired}
        />

        {/* Active tab view — each tab owns the full content area */}
        <main className="flex-1 min-h-0">
          {/* Voice Chat stays mounted (hidden when another tab is active)
              so the voice/wake-word send path and bridge subscriptions
              never drop mid-session. */}
          <div className={activeTab === 'voice' ? 'h-full min-h-0' : 'hidden'}>
            <VoiceChatTab
              agents={agents}
              paired={paired}
              visible={activeTab === 'voice'}
              state={arioState}
              transcript={transcript}
              interimTranscript={interimTranscript}
              onActivate={handleActivate}
              speechSupported={speechSupported}
              wakeMode={wakeMode}
              wakePaused={wake.paused}
              onToggleWakeMode={handleToggleWakeMode}
              cueText={lastCue?.text ?? null}
              ttsAvailable={ttsAvailable}
              onReflexResponse={handleReflexResponse}
              onSendReady={handleSendReady}
            />
          </div>

          {activeTab === 'ideas' && (
            <IdeasTab ideario={ideario} savedIdeas={savedIdeas} onOpenIdea={handleOpenIdea} />
          )}

          {activeTab === 'agents' && (
            <AgentManager agents={agents} onAgentsChange={setAgents} />
          )}

          {activeTab === 'bridge' && (
            <BridgeTab paired={paired} onPairedChange={setPaired} />
          )}

          {activeTab === 'history' && (
            <HistoryTab savedIdeas={savedIdeas} />
          )}

          {activeTab === 'settings' && (
            <Suspense fallback={null}>
              <SettingsPanel
                theme={theme}
                onToggleTheme={handleToggleTheme}
                showDebug={showDebug}
                onToggleDebug={handleToggleDebug}
                selectedModelId={selectedModelId}
                onModelChange={handleModelChange}
                onResetAgents={handleResetAgents}
              />
            </Suspense>
          )}
        </main>

        {/* Bottom tab bar */}
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {showDebug && <DebugOverlay onClose={handleToggleDebug} />}

      {pendingSync && (
        <SettingsSyncPrompt
          settings={pendingSync}
          onAccept={handleSyncAccept}
          onDecline={handleSyncDecline}
        />
      )}
    </div>
  );
}

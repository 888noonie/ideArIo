import { useState, useEffect, useCallback, useRef } from 'react';
import { VoicePanel, type InputMode } from './components/VoicePanel';
import { IdeaCanvas } from './components/IdeaCanvas';
import { StatusBar } from './components/StatusBar';
import { DebugOverlay } from './components/DebugOverlay';
import { TabBar, type TabId } from './components/TabBar';
import { ChatPanel } from './components/ChatPanel';
import { BridgeTab } from './components/BridgeTab';
import { createReflexContext } from './components/reflex-helpers';
import { AgentManager } from './components/AgentManager';
import { SettingsPanel } from './components/SettingsPanel';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis';
import { useWakeWord } from './hooks/useWakeWord';
import { generateIdearioFromTranscript, describeProcessingError } from './lib/nim-proxy';
import { parseIdearioYaml, serializeIdearioYaml } from './lib/yaml-builder';
import { saveIdearioToGist } from './lib/gist-client';
import { saveToLocalDB, loadFromLocalDB, markAsSynced } from './lib/storage';
import {
  loadSelectedModelId,
  saveSelectedModelId,
} from './lib/model-registry';
import { loadTheme, saveTheme, applyTheme, type Theme } from './lib/theme';
import { loadAgents, saveAgents, DEFAULT_AGENTS, type AgentSpec } from './lib/agents';
import { tryReflex } from './lib/reflex';
import { loadChatLog } from './lib/chat-engine';
import type { ArioState, IdearioYAML, SavedIdeario } from './types/ideario';
import type { ModelInfo } from './lib/model-registry';

function generateId(): string {
  return `idea-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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
  const [activeTab, setActiveTab] = useState<TabId>('capture');
  const [arioState, setArioState] = useState<ArioState>('idle');
  const [ideario, setIdeario] = useState<IdearioYAML | null>(null);
  const [savedIdeas, setSavedIdeas] = useState<SavedIdeario[]>([]);
  const [online, setOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending'>('synced');
  const [selectedModelId, setSelectedModelId] = useState<string>(loadSelectedModelId);
  const [inputMode, setInputMode] = useState<InputMode>('voice');
  const [wakeMode, setWakeMode] = useState<boolean>(loadWakeMode);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [showDebug, setShowDebug] = useState(false);
  const [agents, setAgents] = useState<AgentSpec[]>(loadAgents);
  const [paired, setPaired] = useState<boolean>(loadPaired);

  // Reflex context shared by the voice + typed capture paths — reads the
  // persisted chat log so "save this" works from the Capture tab too.
  const captureReflexCtxRef = useRef(createReflexContext(() => loadChatLog()));

  // Persist paired mode (toggled from the Bridge tab).
  useEffect(() => {
    try {
      localStorage.setItem(PAIRED_KEY, String(paired));
    } catch {
      // Ignore localStorage errors
    }
  }, [paired]);

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

  // Fall back to text input when the Web Speech API is unavailable.
  useEffect(() => {
    if (!speechSupported) {
      setInputMode('text');
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
    enabled: wakeMode && speechSupported && inputMode === 'voice',
    onCommand: useCallback((text: string) => {
      processCommandRef.current(text);
    }, []),
    onAutoPause: useCallback(() => {
      speak('Wake mode paused after silence. Tap the orb to resume.', 'normal');
    }, [speak]),
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
      handleSpeechFinalized(transcript, 'voice');
    }
  }, [isListening, transcript]);

  // Mobile fix: if recognition ends with NO transcript and NO error
  // (silence, mobile speech-service hiccup), never leave the orb stuck
  // in "listening" — reset to idle. The reset must only fire on a genuine
  // listening→ended transition: `startListening()` is async, so there is a
  // start-up window between the tap (state set to 'listening') and the
  // recognition `onstart` where `isListening` is still false. Tracking
  // `wasListeningRef` keeps the orb in 'listening' through that window.
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
  useEffect(() => {
    if (noSpeech) {
      clearNoSpeech();
      setArioState((prev) => (prev === 'thinking' ? prev : 'idle'));
      speak("I didn't hear anything — tap and try again, or use Type instead.", 'critical');
    }
  }, [noSpeech, clearNoSpeech, speak]);

  const handleSpeechFinalized = useCallback(async (finalTranscript: string, source: 'voice' | 'manual') => {
    if (!finalTranscript.trim()) return;

    processingRef.current = true;
    setArioState('thinking');
    cue('processing');

    try {
      // Reflex lane FIRST — voice "save this" / "quiet" must work eyes-closed,
      // skipping the YAML/NIM pipeline entirely.
      const reflex = await tryReflex(finalTranscript, captureReflexCtxRef.current);
      if (reflex.handled) {
        if (reflex.response) {
          speak(reflex.response, 'normal');
        }
        cue('saved');
        setArioState('idle');
        return;
      }

      const rawYaml = await generateIdearioFromTranscript(finalTranscript, selectedModelId);
      const parsed = parseIdearioYaml(rawYaml, finalTranscript);

      if (!parsed) {
        throw new Error('Could not parse idea');
      }

      setIdeario(parsed);
      await handleSave(parsed, source);
      cue('saved');
      setArioState('idle');
    } catch (error) {
      console.error('Ideario processing failed:', error);
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
  }, [cue, resetTranscript, selectedModelId, speak]);

  // Keep the wake-word command handler pointing at the latest
  // handleSpeechFinalized — assigned in an effect, not during render.
  useEffect(() => {
    processCommandRef.current = (text: string) => {
      handleSpeechFinalized(text, 'voice');
    };
  }, [handleSpeechFinalized]);

  const handleActivate = useCallback(() => {
    if (arioState === 'thinking') return;

    // In wake mode the orb toggles wake pause/resume instead of a
    // one-shot recording session.
    if (wakeMode) {
      if (wake.paused) {
        wake.resume();
        cue('wake');
      } else {
        wake.pause();
        speak('Wake mode paused. Tap the orb to resume.', 'normal');
      }
      return;
    }

    if (isListening) {
      stopListening();
    } else {
      setIdeario(null);
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
        setIdeario(null);
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

  const handleTextSubmit = useCallback((text: string) => {
    handleSpeechFinalized(text, 'manual');
  }, [handleSpeechFinalized]);

  const handleSave = useCallback(async (ideaToSave: IdearioYAML, source: 'voice' | 'manual') => {
    const id = generateId();
    const yamlString = serializeIdearioYaml(ideaToSave);

    const saved: SavedIdeario = {
      ...ideaToSave,
      id,
      gist_id: undefined,
      synced: false,
      source,
    };

    await saveToLocalDB(saved);
    setSavedIdeas((prev) => [saved, ...prev]);
    setSyncStatus('pending');

    if (navigator.onLine && import.meta.env.VITE_GITHUB_TOKEN) {
      try {
        const { gist_id } = await saveIdearioToGist(saved, yamlString);
        await markAsSynced(id, gist_id);
        saved.gist_id = gist_id;
        saved.synced = true;
        setSavedIdeas((prev) => prev.map((i) => (i.id === id ? saved : i)));
        setSyncStatus('synced');
        cue('synced');
      } catch (error) {
        console.warn('Gist sync failed:', error);
        setSyncStatus('pending');
      }
    }
  }, [cue]);

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

  const handleManualSave = useCallback(() => {
    if (ideario) {
      handleSave(ideario, inputMode === 'text' ? 'manual' : 'voice');
    }
  }, [ideario, handleSave, inputMode]);

  const handleClear = useCallback(() => {
    setIdeario(null);
    resetTranscript();
    setArioState('idle');
  }, [resetTranscript]);

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

  // Apply persisted theme on mount (main.tsx also applies pre-paint).
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Handle speech errors (unsupported browsers degrade to text input
  // instead of nagging the user on load).
  useEffect(() => {
    if (speechError && speechSupported) {
      setArioState('error');
      speak('I did not catch that. Please try again.', 'critical');
    }
  }, [speechError, speechSupported, speak]);

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
          {activeTab === 'capture' && (
            <div className="h-full p-4">
              <VoicePanel
                state={arioState}
                transcript={transcript}
                interimTranscript={interimTranscript}
                onActivate={handleActivate}
                onSave={handleManualSave}
                onClear={handleClear}
                canSave={!!ideario}
                inputMode={inputMode}
                onInputModeChange={setInputMode}
                onTextSubmit={handleTextSubmit}
                speechSupported={speechSupported}
                wakeMode={wakeMode}
                wakePaused={wake.paused}
                onToggleWakeMode={handleToggleWakeMode}
                cueText={lastCue?.text ?? null}
                ttsAvailable={ttsAvailable}
              />
            </div>
          )}

          {activeTab === 'ideas' && (
            <div className="h-full p-4">
              <div className="ario-panel h-full min-h-0">
                <IdeaCanvas ideario={ideario} />
              </div>
            </div>
          )}

          {activeTab === 'chat' && (
            <ChatPanel agents={agents} paired={paired} />
          )}

          {activeTab === 'bridge' && (
            <BridgeTab paired={paired} onPairedChange={setPaired} />
          )}

          {activeTab === 'agents' && (
            <AgentManager agents={agents} onAgentsChange={setAgents} />
          )}

          {activeTab === 'settings' && (
            <SettingsPanel
              theme={theme}
              onToggleTheme={handleToggleTheme}
              showDebug={showDebug}
              onToggleDebug={handleToggleDebug}
              selectedModelId={selectedModelId}
              onModelChange={handleModelChange}
              onResetAgents={handleResetAgents}
            />
          )}
        </main>

        {/* Bottom tab bar */}
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {showDebug && <DebugOverlay onClose={handleToggleDebug} />}
    </div>
  );
}

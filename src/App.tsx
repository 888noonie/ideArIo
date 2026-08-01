import { useState, useEffect, useCallback, useRef } from 'react';
import { VoicePanel } from './components/VoicePanel';
import { IdeaCanvas } from './components/IdeaCanvas';
import { StatusBar } from './components/StatusBar';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis';
import { generateIdearioFromTranscript } from './lib/nim-proxy';
import { parseIdearioYaml, serializeIdearioYaml } from './lib/yaml-builder';
import { isGistSyncEnabled, saveIdearioToGist } from './lib/gist-client';
import { saveToLocalDB, loadFromLocalDB, markAsSynced } from './lib/storage';
import {
  loadSelectedModelId,
  saveSelectedModelId,
} from './lib/model-registry';
import type { ArioState, IdearioYAML, SavedIdeario } from './types/ideario';
import type { ModelInfo } from './lib/model-registry';

function generateId(): string {
  return `idea-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const [arioState, setArioState] = useState<ArioState>('idle');
  const [ideario, setIdeario] = useState<IdearioYAML | null>(null);
  const [savedIdeas, setSavedIdeas] = useState<SavedIdeario[]>([]);
  const [online, setOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending'>('synced');
  const [selectedModelId, setSelectedModelId] = useState<string>(loadSelectedModelId);

  const {
    transcript,
    interimTranscript,
    isListening,
    error: speechError,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition();

  const { cue, speak } = useSpeechSynthesis();
  const processingRef = useRef(false);
  const savedIdeasRef = useRef<SavedIdeario[]>([]);

  useEffect(() => {
    savedIdeasRef.current = savedIdeas;
  }, [savedIdeas]);

  // Load saved ideas on mount
  useEffect(() => {
    loadFromLocalDB()
      .then((ideas) => setSavedIdeas(ideas))
      .catch(() => setSavedIdeas([]));
  }, []);

  const handleSave = useCallback(async (ideaToSave: IdearioYAML) => {
    const id = generateId();
    const yamlString = serializeIdearioYaml(ideaToSave);

    const saved: SavedIdeario = {
      ...ideaToSave,
      id,
      gist_id: undefined,
      synced: false,
      source: 'voice',
    };

    await saveToLocalDB(saved);
    setSavedIdeas((prev) => [saved, ...prev]);
    setSyncStatus('pending');

    if (navigator.onLine && isGistSyncEnabled()) {
      try {
        const { gist_id } = await saveIdearioToGist(saved, yamlString);
        await markAsSynced(id, gist_id);
        setSavedIdeas((prev) => prev.map((idea) => (
          idea.id === id ? { ...idea, gist_id, synced: true } : idea
        )));
        setSyncStatus('synced');
        cue('synced');
      } catch (error) {
        console.warn('Gist sync failed:', error);
        setSyncStatus('pending');
      }
    }
  }, [cue]);

  const syncPendingIdeas = useCallback(async () => {
    const pending = savedIdeasRef.current.filter((idea) => !idea.synced);
    if (pending.length === 0) {
      setSyncStatus('synced');
      return;
    }
    if (!navigator.onLine || !isGistSyncEnabled()) {
      setSyncStatus('pending');
      return;
    }

    const syncedGists = new Map<string, string>();
    let hasFailures = false;
    for (const idea of pending) {
      try {
        const yamlString = serializeIdearioYaml(idea);
        const { gist_id } = await saveIdearioToGist(idea, yamlString);
        await markAsSynced(idea.id, gist_id);
        syncedGists.set(idea.id, gist_id);
      } catch (error) {
        console.warn('Failed to sync idea:', idea.id, error);
        hasFailures = true;
      }
    }

    if (syncedGists.size > 0) {
      setSavedIdeas((previous) => previous.map((idea) => {
        const gistId = syncedGists.get(idea.id);
        return gistId ? { ...idea, gist_id: gistId, synced: true } : idea;
      }));
    }
    setSyncStatus(hasFailures ? 'pending' : 'synced');
  }, []);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      cue('online');
      void syncPendingIdeas();
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
  }, [cue, syncPendingIdeas]);

  const handleSpeechFinalized = useCallback(async (finalTranscript: string) => {
    if (!finalTranscript.trim()) return;

    processingRef.current = true;
    setArioState('thinking');
    cue('processing');

    try {
      const rawYaml = await generateIdearioFromTranscript(finalTranscript, selectedModelId);
      const parsed = parseIdearioYaml(rawYaml);

      if (!parsed) {
        throw new Error('Could not parse idea');
      }

      setIdeario(parsed);
      await handleSave(parsed);
      cue('saved');
      setArioState('idle');
    } catch (error) {
      console.error('Ideario processing failed:', error);
      cue('error');
      setArioState('error');
      speak('I could not process that idea. Please try again.', 'critical');
    } finally {
      processingRef.current = false;
      resetTranscript();
    }
  }, [cue, handleSave, resetTranscript, selectedModelId, speak]);

  // Sync state when listening stops
  useEffect(() => {
    if (!isListening && transcript && !processingRef.current) {
      void handleSpeechFinalized(transcript);
    }
  }, [handleSpeechFinalized, isListening, transcript]);

  const handleActivate = useCallback(() => {
    if (arioState === 'thinking') return;

    if (isListening) {
      stopListening();
    } else {
      setIdeario(null);
      resetTranscript();
      setArioState('listening');
      cue('listening');
      startListening();
    }
  }, [arioState, isListening, startListening, stopListening, resetTranscript, cue]);

  const handleManualSave = useCallback(() => {
    if (ideario) {
      handleSave(ideario);
    }
  }, [ideario, handleSave]);

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

  // Handle speech errors
  useEffect(() => {
    if (speechError) {
      setArioState('error');
      speak('I did not catch that. Please try again.', 'critical');
    }
  }, [speechError, speak]);

  const allSynced = savedIdeas.length === 0 || savedIdeas.every((i) => i.synced);

  return (
    <div className="w-screen h-screen bg-ario-dark flex items-center justify-center p-4 overflow-hidden">
      <div className="w-full max-w-[1920px] aspect-[8/3] max-h-[90vh] flex flex-col bg-ario-dark rounded-[32px] overflow-hidden border border-white/5 shadow-2xl">
        {/* Top dust divider */}
        <div className="ario-divider" />

        {/* Main 8:3 content */}
        <div className="flex-1 grid grid-cols-[30fr_70fr] gap-4 p-4 min-h-0">
          <VoicePanel
            state={arioState}
            transcript={transcript}
            interimTranscript={interimTranscript}
            onActivate={handleActivate}
            onSave={handleManualSave}
            onClear={handleClear}
            canSave={!!ideario}
          />

          <div className="ario-panel min-h-0">
            <IdeaCanvas ideario={ideario} />
          </div>
        </div>

        {/* Status bar */}
        <StatusBar
          online={online}
          synced={allSynced && syncStatus === 'synced'}
          ideaCount={savedIdeas.length}
          selectedModelId={selectedModelId}
          onModelChange={handleModelChange}
        />
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { VoicePanel } from './components/VoicePanel';
import { IdeaCanvas } from './components/IdeaCanvas';
import { StatusBar } from './components/StatusBar';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis';
import { generateIdearioFromTranscript } from './lib/nim-proxy';
import { parseIdearioYaml, serializeIdearioYaml } from './lib/yaml-builder';
import { saveIdearioToGist } from './lib/gist-client';
import { saveToLocalDB, loadFromLocalDB, markAsSynced } from './lib/storage';
import type { ArioState, IdearioYAML, SavedIdeario } from './types/ideario';

function generateId(): string {
  return `idea-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const [arioState, setArioState] = useState<ArioState>('idle');
  const [ideario, setIdeario] = useState<IdearioYAML | null>(null);
  const [savedIdeas, setSavedIdeas] = useState<SavedIdeario[]>([]);
  const [online, setOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending'>('synced');

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

  // Sync state when listening stops
  useEffect(() => {
    if (!isListening && transcript && !processingRef.current) {
      handleSpeechFinalized(transcript);
    }
  }, [isListening, transcript]);

  const handleSpeechFinalized = useCallback(async (finalTranscript: string) => {
    if (!finalTranscript.trim()) return;

    processingRef.current = true;
    setArioState('thinking');
    cue('processing');

    try {
      const rawYaml = await generateIdearioFromTranscript(finalTranscript);
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
  }, [cue, resetTranscript, speak]);

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
      handleSave(ideario);
    }
  }, [ideario, handleSave]);

  const handleClear = useCallback(() => {
    setIdeario(null);
    resetTranscript();
    setArioState('idle');
  }, [resetTranscript]);

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
        />
      </div>
    </div>
  );
}

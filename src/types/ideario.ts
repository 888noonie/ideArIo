export type ArioState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export type IdeaCategory = 'product' | 'business' | 'creative' | 'technical' | 'personal';

export type NodeType = 'concept' | 'action' | 'question' | 'resource';

export interface IdearioNode {
  id: string;
  label: string;
  type: NodeType;
  connections: string[];
}

export interface IdearioYAML {
  title: string;
  category: IdeaCategory;
  summary: string;
  tags: string[];
  nodes: IdearioNode[];
  created_at?: string;
  updated_at?: string;
}

export interface SavedIdeario extends IdearioYAML {
  id: string;
  gist_id?: string;
  synced: boolean;
  source: 'voice' | 'manual';
}

export interface SpeechRecognitionHook {
  transcript: string;
  interimTranscript: string;
  isListening: boolean;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  supported: boolean;
}

export interface SpeechSynthesisHook {
  speak: (text: string, priority?: 'critical' | 'normal' | 'silent') => void;
  cue: (type: ArioCue) => void;
  speaking: boolean;
  supported: boolean;
}

export type ArioCue =
  | 'listening'
  | 'processing'
  | 'saved'
  | 'error'
  | 'synced'
  | 'offline'
  | 'online'
  | 'wake';

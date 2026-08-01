export type ArioState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export type IdeaCategory = 'product' | 'business' | 'creative' | 'technical' | 'personal';

export type NodeType = 'concept' | 'action' | 'question' | 'resource';

export interface IdearioNode {
  id: string;
  label: string;
  type: NodeType;
  connections: string[];
}

export interface IdearioContext {
  location?: string;
  time?: string;
  vehicle?: string;
}

export interface IdearioYAML {
  title: string;
  category: IdeaCategory;
  summary: string;
  tags: string[];
  nodes: IdearioNode[];
  /** Original spoken/typed text that produced this idea (schema v1.1+) */
  transcript?: string;
  /** Capture context placeholders: location, time, vehicle data (schema v1.1+) */
  context?: IdearioContext;
  /** External asset references: 3D models, images, URLs (schema v1.1+) */
  artifacts?: string[];
  /** Schema version string, e.g. "1.1". Absent means legacy v1.0. */
  version?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SavedIdeario extends IdearioYAML {
  id: string;
  gist_id?: string;
  synced: boolean;
  source: 'voice' | 'manual';
}

export interface SpeechRecognitionOptions {
  /** Keep recognition alive across pauses (used by wake-word mode). */
  continuous?: boolean;
  interimResults?: boolean;
  lang?: string;
  /**
   * Milliseconds without any interim/final result before the watchdog stops
   * recognition and reports a no-speech condition. Set to 0 to disable.
   * Defaults to 7000.
   */
  watchdogMs?: number;
  /** Fired on a `no-speech` error or a watchdog timeout. Recoverable. */
  onNoSpeech?: () => void;
  /** Fired when recognition ends; `hadResult` is true if any result arrived. */
  onSessionEnd?: (hadResult: boolean) => void;
  /** Fired for non-recoverable errors (not-allowed, audio-capture, ...). */
  onFatalError?: (error: string) => void;
  /** Fired on every result event with the final chunk and current interim. */
  onResult?: (finalChunk: string, interim: string) => void;
}

export interface SpeechRecognitionHook {
  transcript: string;
  interimTranscript: string;
  isListening: boolean;
  error: string | null;
  /** True when a no-speech condition was detected (recoverable). */
  noSpeech: boolean;
  clearNoSpeech: () => void;
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
  /** Last spoken/cued line — always set, even when audio is unavailable,
   *  so the UI can show it as a car-safe subtitle. Null once cleared. */
  lastCue: { text: string; ts: number } | null;
  /** False when the TTS engine is missing or repeatedly failing (e.g.
   *  Android WebView without a speech engine) — UI should stay visual. */
  ttsAvailable: boolean;
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

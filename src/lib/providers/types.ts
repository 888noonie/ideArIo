export type ProviderId = 'openrouter' | 'ollama' | 'nim' | 'gemini' | 'groq' | 'ofox';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model: string;
  signal?: AbortSignal;
}

export interface HealthCheckResult {
  ok: boolean;
  detail: string;
}

export interface ChatProvider {
  id: ProviderId;
  label: string;
  requiresKey: boolean;
  isLocal: boolean;
  chat(req: ChatRequest): Promise<string>;
  listModels(): Promise<string[]>;
  /** true when the provider has everything it needs (key present / reachable config) */
  isConfigured(): boolean;
  /** Optional lightweight reachability probe (agent card signal-tower button). */
  healthCheck?(): Promise<HealthCheckResult>;
}

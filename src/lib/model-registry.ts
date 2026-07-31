export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  tags: string[];
}

export const DEFAULT_MODEL_ID = 'deepseek-ai/deepseek-v4-pro';

export const MODEL_REGISTRY: ModelInfo[] = [
  {
    id: 'deepseek-ai/deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    provider: 'DeepSeek',
    description: 'High-quality reasoning and structured output',
    tags: ['primary', 'reasoning'],
  },
  {
    id: 'deepseek-ai/deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    provider: 'DeepSeek',
    description: 'Fast responses for quick captures',
    tags: ['fast', 'fallback'],
  },
  {
    id: 'z-ai/glm-5.2',
    name: 'GLM 5.2',
    provider: 'Zhipu AI',
    description: 'Balanced speed and quality',
    tags: ['balanced'],
  },
  {
    id: 'moonshotai/kimi-k2.6',
    name: 'Kimi K2.6',
    provider: 'Moonshot AI',
    description: 'Strong long-context understanding',
    tags: ['context'],
  },
  {
    id: 'minimaxai/minimax-m3',
    name: 'MiniMax M3',
    provider: 'MiniMax',
    description: 'Creative idea structuring',
    tags: ['creative'],
  },
];

export function getModelById(id: string): ModelInfo | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}

export function getDefaultModel(): ModelInfo {
  return getModelById(DEFAULT_MODEL_ID) || MODEL_REGISTRY[0];
}

export function loadSelectedModelId(): string {
  try {
    const stored = localStorage.getItem('ideario-selected-model');
    if (stored && getModelById(stored)) {
      return stored;
    }
  } catch {
    // Ignore localStorage errors
  }
  return DEFAULT_MODEL_ID;
}

export function saveSelectedModelId(id: string): void {
  try {
    localStorage.setItem('ideario-selected-model', id);
  } catch {
    // Ignore localStorage errors
  }
}

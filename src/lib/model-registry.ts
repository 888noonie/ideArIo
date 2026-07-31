export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  tags: string[];
}

export const DEFAULT_MODEL_ID = 'deepseek-ai/deepseek-v4-pro';

// Full registry of free NVIDIA NIM preview endpoints.
// Add or remove entries here to update the dropdown and fallback cycle.
export const MODEL_REGISTRY: ModelInfo[] = [
  // Richard's preferred defaults
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

  // Meta / Llama family
  {
    id: 'meta/llama-3.1-8b-instruct',
    name: 'Llama 3.1 8B',
    provider: 'Meta',
    description: 'Fast and lightweight',
    tags: ['fast'],
  },
  {
    id: 'meta/llama-3.1-70b-instruct',
    name: 'Llama 3.1 70B',
    provider: 'Meta',
    description: 'Strong general-purpose reasoning',
    tags: ['reasoning'],
  },
  {
    id: 'meta/llama-3.2-1b-instruct',
    name: 'Llama 3.2 1B',
    provider: 'Meta',
    description: 'Ultra-fast on-device feel',
    tags: ['fast'],
  },
  {
    id: 'meta/llama-3.2-3b-instruct',
    name: 'Llama 3.2 3B',
    provider: 'Meta',
    description: 'Compact and efficient',
    tags: ['fast'],
  },
  {
    id: 'meta/llama-3.2-11b-vision-instruct',
    name: 'Llama 3.2 11B Vision',
    provider: 'Meta',
    description: 'Vision + language understanding',
    tags: ['vision'],
  },
  {
    id: 'meta/llama-3.2-90b-vision-instruct',
    name: 'Llama 3.2 90B Vision',
    provider: 'Meta',
    description: 'Large vision-language model',
    tags: ['vision'],
  },
  {
    id: 'meta/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    provider: 'Meta',
    description: 'Improved instruction following',
    tags: ['reasoning'],
  },
  {
    id: 'meta/llama2-70b',
    name: 'Llama 2 70B',
    provider: 'Meta',
    description: 'Legacy Llama model',
    tags: ['legacy'],
  },
  {
    id: 'meta/codellama-70b',
    name: 'Code Llama 70B',
    provider: 'Meta',
    description: 'Code generation and technical ideas',
    tags: ['coding'],
  },
  {
    id: 'meta/llama-guard-4-12b',
    name: 'Llama Guard 4 12B',
    provider: 'Meta',
    description: 'Safety guardrails',
    tags: ['safety'],
  },

  // Mistral / Mixtral
  {
    id: 'mistralai/mistral-7b-instruct-v0.3',
    name: 'Mistral 7B',
    provider: 'Mistral',
    description: 'Fast and capable',
    tags: ['fast'],
  },
  {
    id: 'mistralai/mistral-large',
    name: 'Mistral Large',
    provider: 'Mistral',
    description: 'High-quality instruction following',
    tags: ['reasoning'],
  },
  {
    id: 'mistralai/mistral-large-2-instruct',
    name: 'Mistral Large 2',
    provider: 'Mistral',
    description: 'Latest Mistral large model',
    tags: ['reasoning'],
  },
  {
    id: 'mistralai/mistral-medium-3.5-128b',
    name: 'Mistral Medium 3.5',
    provider: 'Mistral',
    description: 'Balanced performance',
    tags: ['balanced'],
  },
  {
    id: 'mistralai/mistral-nemotron',
    name: 'Mistral Nemotron',
    provider: 'Mistral',
    description: 'NVIDIA-tuned Mistral',
    tags: ['balanced'],
  },
  {
    id: 'mistralai/mixtral-8x7b-instruct-v0.1',
    name: 'Mixtral 8x7B',
    provider: 'Mistral',
    description: 'Sparse mixture-of-experts',
    tags: ['reasoning'],
  },
  {
    id: 'mistralai/mixtral-8x22b-v0.1',
    name: 'Mixtral 8x22B',
    provider: 'Mistral',
    description: 'Large sparse MoE',
    tags: ['reasoning'],
  },
  {
    id: 'mistralai/codestral-22b-instruct-v0.1',
    name: 'Codestral 22B',
    provider: 'Mistral',
    description: 'Code-focused assistant',
    tags: ['coding'],
  },

  // Google / Gemma
  {
    id: 'google/gemma-2b',
    name: 'Gemma 2B',
    provider: 'Google',
    description: 'Tiny and fast',
    tags: ['fast'],
  },
  {
    id: 'google/codegemma-7b',
    name: 'CodeGemma 7B',
    provider: 'Google',
    description: 'Code generation',
    tags: ['coding'],
  },
  {
    id: 'google/codegemma-1.1-7b',
    name: 'CodeGemma 1.1 7B',
    provider: 'Google',
    description: 'Improved code model',
    tags: ['coding'],
  },
  {
    id: 'google/gemma-3-4b-it',
    name: 'Gemma 3 4B',
    provider: 'Google',
    description: 'Efficient instruction model',
    tags: ['fast'],
  },
  {
    id: 'google/gemma-3-12b-it',
    name: 'Gemma 3 12B',
    provider: 'Google',
    description: 'Mid-size instruction model',
    tags: ['balanced'],
  },
  {
    id: 'google/gemma-4-31b-it',
    name: 'Gemma 4 31B',
    provider: 'Google',
    description: 'Large instruction model',
    tags: ['reasoning'],
  },
  {
    id: 'google/recurrentgemma-2b',
    name: 'RecurrentGemma 2B',
    provider: 'Google',
    description: 'Recurrent architecture',
    tags: ['fast'],
  },

  // Microsoft / Phi
  {
    id: 'microsoft/phi-3.5-moe-instruct',
    name: 'Phi 3.5 MoE',
    provider: 'Microsoft',
    description: 'Mixture-of-experts efficiency',
    tags: ['balanced'],
  },
  {
    id: 'microsoft/phi-3-vision-128k-instruct',
    name: 'Phi 3 Vision',
    provider: 'Microsoft',
    description: 'Vision + language',
    tags: ['vision'],
  },
  {
    id: 'microsoft/kosmos-2',
    name: 'KOSMOS-2',
    provider: 'Microsoft',
    description: 'Multimodal understanding',
    tags: ['vision'],
  },

  // DeepSeek
  {
    id: 'deepseek-ai/deepseek-coder-6.7b-instruct',
    name: 'DeepSeek Coder 6.7B',
    provider: 'DeepSeek',
    description: 'Code and technical ideas',
    tags: ['coding'],
  },

  // AI21
  {
    id: 'ai21labs/jamba-1.5-large-instruct',
    name: 'Jamba 1.5 Large',
    provider: 'AI21',
    description: 'Long-context hybrid architecture',
    tags: ['context'],
  },

  // 01.AI
  {
    id: '01-ai/yi-large',
    name: 'Yi Large',
    provider: '01.AI',
    description: 'Strong bilingual model',
    tags: ['reasoning'],
  },

  // Adept
  {
    id: 'adept/fuyu-8b',
    name: 'Fuyu 8B',
    provider: 'Adept',
    description: 'Vision-language model',
    tags: ['vision'],
  },

  // Databricks
  {
    id: 'databricks/dbrx-instruct',
    name: 'DBRX Instruct',
    provider: 'Databricks',
    description: 'Open foundation model',
    tags: ['reasoning'],
  },

  // BigCode
  {
    id: 'bigcode/starcoder2-15b',
    name: 'StarCoder2 15B',
    provider: 'BigCode',
    description: 'Code generation',
    tags: ['coding'],
  },

  // IBM Granite
  {
    id: 'ibm/granite-3.0-3b-a800m-instruct',
    name: 'Granite 3.0 3B',
    provider: 'IBM',
    description: 'Compact enterprise model',
    tags: ['fast'],
  },
  {
    id: 'ibm/granite-3.0-8b-instruct',
    name: 'Granite 3.0 8B',
    provider: 'IBM',
    description: 'Efficient enterprise model',
    tags: ['balanced'],
  },
  {
    id: 'ibm/granite-8b-code-instruct',
    name: 'Granite 8B Code',
    provider: 'IBM',
    description: 'Code-focused',
    tags: ['coding'],
  },
  {
    id: 'ibm/granite-34b-code-instruct',
    name: 'Granite 34B Code',
    provider: 'IBM',
    description: 'Large code model',
    tags: ['coding'],
  },

  // Sea Lion
  {
    id: 'aisingapore/sea-lion-7b-instruct',
    name: 'SEA-LION 7B',
    provider: 'AI Singapore',
    description: 'Southeast Asian languages',
    tags: ['balanced'],
  },

  // OpenAI OSS
  {
    id: 'openai/gpt-oss-20b',
    name: 'GPT-OSS 20B',
    provider: 'OpenAI',
    description: 'Open-weight research model',
    tags: ['reasoning'],
  },
  {
    id: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B',
    provider: 'OpenAI',
    description: 'Large open-weight model',
    tags: ['reasoning'],
  },

  // Writer
  {
    id: 'writer/palmyra-creative-122b',
    name: 'Palmyra Creative 122B',
    provider: 'Writer',
    description: 'Creative writing and ideation',
    tags: ['creative'],
  },
  {
    id: 'writer/palmyra-fin-70b-32k',
    name: 'Palmyra Fin 70B',
    provider: 'Writer',
    description: 'Finance domain',
    tags: ['domain'],
  },
  {
    id: 'writer/palmyra-med-70b',
    name: 'Palmyra Med 70B',
    provider: 'Writer',
    description: 'Medical domain',
    tags: ['domain'],
  },
  {
    id: 'writer/palmyra-med-70b-32k',
    name: 'Palmyra Med 70B 32K',
    provider: 'Writer',
    description: 'Long-context medical',
    tags: ['domain'],
  },

  // StepFun
  {
    id: 'stepfun-ai/step-3.7-flash',
    name: 'Step 3.7 Flash',
    provider: 'StepFun',
    description: 'Fast multilingual model',
    tags: ['fast'],
  },

  // Poolside
  {
    id: 'poolside/laguna-xs-2.1',
    name: 'Laguna XS 2.1',
    provider: 'Poolside',
    description: 'Code assistant',
    tags: ['coding'],
  },

  // Thinking Machines
  {
    id: 'thinkingmachines/inkling',
    name: 'Inkling',
    provider: 'Thinking Machines',
    description: 'Multilingual reasoning',
    tags: ['balanced'],
  },

  // Zyphra
  {
    id: 'zyphra/zamba2-7b-instruct',
    name: 'Zamba2 7B',
    provider: 'Zyphra',
    description: 'Efficient instruction model',
    tags: ['fast'],
  },

  // Snowflake
  {
    id: 'snowflake/arctic-embed-l',
    name: 'Arctic Embed L',
    provider: 'Snowflake',
    description: 'Embedding model',
    tags: ['embedding'],
  },

  // NVIDIA Nemotron family
  {
    id: 'nvidia/llama-3.1-nemotron-70b-instruct',
    name: 'Nemotron 70B',
    provider: 'NVIDIA',
    description: 'NVIDIA-tuned Llama',
    tags: ['reasoning'],
  },
  {
    id: 'nvidia/llama-3.1-nemotron-51b-instruct',
    name: 'Nemotron 51B',
    provider: 'NVIDIA',
    description: 'Mid-size Nemotron',
    tags: ['reasoning'],
  },
  {
    id: 'nvidia/llama-3.1-nemotron-nano-8b-v1',
    name: 'Nemotron Nano 8B',
    provider: 'NVIDIA',
    description: 'Fast NVIDIA-tuned model',
    tags: ['fast'],
  },
  {
    id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
    name: 'Nemotron Ultra 253B',
    provider: 'NVIDIA',
    description: 'Large Nemotron model',
    tags: ['reasoning'],
  },
  {
    id: 'nvidia/llama-3.3-nemotron-super-49b-v1',
    name: 'Nemotron Super 49B',
    provider: 'NVIDIA',
    description: 'Balanced large model',
    tags: ['reasoning'],
  },
  {
    id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
    name: 'Nemotron Super 49B v1.5',
    provider: 'NVIDIA',
    description: 'Updated Super model',
    tags: ['reasoning'],
  },
  {
    id: 'nvidia/nemotron-4-340b-instruct',
    name: 'Nemotron 4 340B',
    provider: 'NVIDIA',
    description: 'Massive instruction model',
    tags: ['reasoning'],
  },
  {
    id: 'nvidia/nemotron-4-340b-reward',
    name: 'Nemotron 4 340B Reward',
    provider: 'NVIDIA',
    description: 'Reward model',
    tags: ['reward'],
  },
  {
    id: 'nvidia/nemotron-mini-4b-instruct',
    name: 'Nemotron Mini 4B',
    provider: 'NVIDIA',
    description: 'Tiny instruct model',
    tags: ['fast'],
  },
  {
    id: 'nvidia/nemotron-3-nano-30b-a3b',
    name: 'Nemotron 3 Nano 30B',
    provider: 'NVIDIA',
    description: 'Efficient MoE',
    tags: ['balanced'],
  },
  {
    id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    name: 'Nemotron 3 Nano Omni',
    provider: 'NVIDIA',
    description: 'Multimodal reasoning',
    tags: ['reasoning'],
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b',
    name: 'Nemotron 3 Super 120B',
    provider: 'NVIDIA',
    description: 'Large MoE',
    tags: ['reasoning'],
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b',
    name: 'Nemotron 3 Ultra 550B',
    provider: 'NVIDIA',
    description: 'Massive MoE',
    tags: ['reasoning'],
  },

  // NVIDIA safety / guardrails
  {
    id: 'nvidia/llama-3.1-nemoguard-8b-content-safety',
    name: 'NemoGuard Content Safety',
    provider: 'NVIDIA',
    description: 'Content safety guard',
    tags: ['safety'],
  },
  {
    id: 'nvidia/llama-3.1-nemoguard-8b-topic-control',
    name: 'NemoGuard Topic Control',
    provider: 'NVIDIA',
    description: 'Topic control guard',
    tags: ['safety'],
  },
  {
    id: 'nvidia/llama-3.1-nemotron-safety-guard-8b-v3',
    name: 'Nemotron Safety Guard 8B',
    provider: 'NVIDIA',
    description: 'Safety guardrails',
    tags: ['safety'],
  },
  {
    id: 'nvidia/nemotron-3.5-content-safety',
    name: 'Nemotron 3.5 Content Safety',
    provider: 'NVIDIA',
    description: 'Content moderation',
    tags: ['safety'],
  },

  // NVIDIA vision / embedding
  {
    id: 'nvidia/neva-22b',
    name: 'NeVA 22B',
    provider: 'NVIDIA',
    description: 'Vision-language model',
    tags: ['vision'],
  },
  {
    id: 'nvidia/vila',
    name: 'VILA',
    provider: 'NVIDIA',
    description: 'Vision-language assistant',
    tags: ['vision'],
  },
  {
    id: 'nvidia/nvclip',
    name: 'NVCLIP',
    provider: 'NVIDIA',
    description: 'Vision embedding',
    tags: ['embedding'],
  },
  {
    id: 'nvidia/nv-embed-v1',
    name: 'NV-Embed v1',
    provider: 'NVIDIA',
    description: 'Text embedding',
    tags: ['embedding'],
  },
  {
    id: 'nvidia/nv-embedqa-e5-v5',
    name: 'NV-EmbedQA E5',
    provider: 'NVIDIA',
    description: 'QA embedding',
    tags: ['embedding'],
  },
  {
    id: 'nvidia/nv-embedqa-mistral-7b-v2',
    name: 'NV-EmbedQA Mistral 7B',
    provider: 'NVIDIA',
    description: 'Mistral-based embedding',
    tags: ['embedding'],
  },
  {
    id: 'nvidia/embed-qa-4',
    name: 'Embed QA 4',
    provider: 'NVIDIA',
    description: 'Embedding model',
    tags: ['embedding'],
  },
  {
    id: 'nvidia/nv-embedcode-7b-v1',
    name: 'NV-EmbedCode 7B',
    provider: 'NVIDIA',
    description: 'Code embedding',
    tags: ['embedding'],
  },

  // NVIDIA parsing / retrieval
  {
    id: 'nvidia/nemotron-parse',
    name: 'Nemotron Parse',
    provider: 'NVIDIA',
    description: 'Document parsing',
    tags: ['parsing'],
  },
  {
    id: 'nvidia/nemoretriever-parse',
    name: 'NemoRetriever Parse',
    provider: 'NVIDIA',
    description: 'Retrieval parsing',
    tags: ['parsing'],
  },
  {
    id: 'nvidia/llama-3.2-nv-embedqa-1b-v1',
    name: 'NV-EmbedQA 1B',
    provider: 'NVIDIA',
    description: 'Light embedding',
    tags: ['embedding'],
  },
  {
    id: 'nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1',
    name: 'NemoRetriever VLM Embed',
    provider: 'NVIDIA',
    description: 'Vision-language embedding',
    tags: ['embedding'],
  },
  {
    id: 'nvidia/llama-nemotron-embed-1b-v2',
    name: 'Nemotron Embed 1B v2',
    provider: 'NVIDIA',
    description: 'Text embedding',
    tags: ['embedding'],
  },
  {
    id: 'nvidia/llama-nemotron-embed-vl-1b-v2',
    name: 'Nemotron Embed VL 1B',
    provider: 'NVIDIA',
    description: 'Vision-language embedding',
    tags: ['embedding'],
  },
  {
    id: 'nvidia/llama3-chatqa-1.5-70b',
    name: 'ChatQA 1.5 70B',
    provider: 'NVIDIA',
    description: 'Long-context QA',
    tags: ['context'],
  },

  // NVIDIA translation
  {
    id: 'nvidia/riva-translate-4b-instruct',
    name: 'Riva Translate 4B',
    provider: 'NVIDIA',
    description: 'Translation model',
    tags: ['translation'],
  },
  {
    id: 'nvidia/riva-translate-4b-instruct-v1.1',
    name: 'Riva Translate 4B v1.1',
    provider: 'NVIDIA',
    description: 'Translation model',
    tags: ['translation'],
  },
  {
    id: 'nvidia/riva-translate-4b-instruct-v2',
    name: 'Riva Translate 4B v2',
    provider: 'NVIDIA',
    description: 'Translation model',
    tags: ['translation'],
  },

  // NVIDIA misc
  {
    id: 'nvidia/cosmos-reason2-8b',
    name: 'Cosmos Reason2 8B',
    provider: 'NVIDIA',
    description: 'Physical reasoning',
    tags: ['reasoning'],
  },
  {
    id: 'nvidia/ising-calibration-1.5-31b',
    name: 'Ising Calibration 1.5 31B',
    provider: 'NVIDIA',
    description: 'Scientific model',
    tags: ['domain'],
  },
  {
    id: 'nvidia/ai-synthetic-video-detector',
    name: 'Synthetic Video Detector',
    provider: 'NVIDIA',
    description: 'Video detection',
    tags: ['detection'],
  },
  {
    id: 'nvidia/mistral-nemo-minitron-8b-8k-instruct',
    name: 'Mistral Nemo Minitron 8B',
    provider: 'NVIDIA',
    description: 'Distilled instruct model',
    tags: ['fast'],
  },
  {
    id: 'nvidia/nemotron-nano-12b-v2-vl',
    name: 'Nemotron Nano 12B VL',
    provider: 'NVIDIA',
    description: 'Vision-language model',
    tags: ['vision'],
  },
  {
    id: 'nvidia/nemotron-nano-3-30b-a3b',
    name: 'Nemotron Nano 3 30B',
    provider: 'NVIDIA',
    description: 'Efficient reasoning',
    tags: ['balanced'],
  },
  {
    id: 'nvidia/nvidia-nemotron-nano-9b-v2',
    name: 'Nemotron Nano 9B v2',
    provider: 'NVIDIA',
    description: 'Compact reasoning',
    tags: ['fast'],
  },

  // NV-Mistral
  {
    id: 'nv-mistralai/mistral-nemo-12b-instruct',
    name: 'Mistral Nemo 12B',
    provider: 'NV-Mistral',
    description: 'NVIDIA-hosted Mistral',
    tags: ['balanced'],
  },

  // BGE
  {
    id: 'baai/bge-m3',
    name: 'BGE-M3',
    provider: 'BAAI',
    description: 'Multilingual embedding',
    tags: ['embedding'],
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

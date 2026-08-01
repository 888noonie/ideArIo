/**
 * Mock NVIDIA NIM responses for offline demos and local development.
 * Importable from both the browser bundle and the Vite dev-server
 * middleware (no import.meta.env, no DOM access).
 */

import { dump } from 'js-yaml';

export interface MockChatCompletion {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

function titleCase(words: string[]): string {
  return words
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'mock-idea';
}

/** Build mock Ideario YAML derived (loosely) from the transcript. */
export function buildMockYaml(transcript: string): string {
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  const title = titleCase(words.slice(0, 5)).slice(0, 48) || 'Untitled Mock Idea';
  const exploreId = `explore-${slugify(words.slice(0, 2).join(' ') || 'idea')}`;
  const now = new Date().toISOString();

  const idea = {
    title,
    category: 'creative',
    summary: `Mock idea generated locally (VITE_USE_MOCK_NIM). Based on: "${transcript.slice(0, 120)}"`,
    tags: ['mock', 'local-dev', 'ideario'],
    nodes: [
      {
        id: 'core',
        label: titleCase(words.slice(0, 2)).slice(0, 24) || 'Core Idea',
        type: 'concept',
        connections: [exploreId, 'next-steps', 'open-questions'],
      },
      { id: exploreId, label: 'Explore', type: 'concept', connections: ['core'] },
      { id: 'next-steps', label: 'Next Steps', type: 'action', connections: ['core'] },
      { id: 'open-questions', label: 'Open Questions', type: 'question', connections: ['core'] },
      { id: 'resources', label: 'Resources', type: 'resource', connections: ['next-steps'] },
    ],
    transcript: transcript.slice(0, 300),
    version: '1.1',
    created_at: now,
    updated_at: now,
  };

  return dump(idea, { indent: 2, lineWidth: -1, sortKeys: false });
}

/** Build an OpenAI-shaped chat completion response containing mock YAML. */
export function buildMockCompletion(transcript: string, model?: string): MockChatCompletion {
  return {
    id: `mock-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model || 'mock/local-dev',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: buildMockYaml(transcript) },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

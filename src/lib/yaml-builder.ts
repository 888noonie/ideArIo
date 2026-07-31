import * as yaml from 'js-yaml';
import type { IdearioYAML } from '../types/ideario';

export const SYSTEM_PROMPT = `You are Ario, the noble idea companion for Ideario.
Convert the user's spoken idea into a valid Ideario YAML object.

Schema:
---
title: string (short, catchy name for the idea)
category: enum[product, business, creative, technical, personal]
summary: string (one or two sentence description)
tags: string[] (3-6 relevant keywords)
nodes:
  - id: string (lowercase, no spaces)
    label: string (short display label)
    type: enum[concept, action, question, resource]
    connections: string[] (ids of related nodes)
created_at: ISO timestamp (optional)
updated_at: ISO timestamp (optional)
---

Rules:
- Return ONLY valid YAML, no markdown fences, no explanations.
- The first node should have id "core" and type "concept".
- Create 3-7 nodes total.
- Make connections meaningful.
- If the idea is vague, create question nodes to explore it.`;

export function buildUserPrompt(transcript: string): string {
  return `Spoken idea: "${transcript}"`;
}

export function parseIdearioYaml(raw: string): IdearioYAML | null {
  try {
    // Strip markdown fences if the model added them
    const cleaned = raw
      .replace(/^```yaml\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    const parsed = yaml.load(cleaned);
    if (!parsed || typeof parsed !== 'object') return null;

    const data = parsed as Partial<IdearioYAML>;

    // Validate required fields
    if (!data.title || !Array.isArray(data.nodes)) return null;

    const now = new Date().toISOString();

    return {
      title: String(data.title),
      category: validateCategory(data.category),
      summary: String(data.summary || ''),
      tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
      nodes: data.nodes.map((n, i) => ({
        id: String(n.id || `node-${i}`),
        label: String(n.label || 'Untitled'),
        type: validateNodeType(n.type),
        connections: Array.isArray(n.connections) ? n.connections.map(String) : [],
      })),
      created_at: data.created_at || now,
      updated_at: data.updated_at || now,
    };
  } catch {
    return null;
  }
}

export function serializeIdearioYaml(ideario: IdearioYAML): string {
  return yaml.dump(ideario, {
    indent: 2,
    lineWidth: -1,
    sortKeys: false,
  });
}

function validateCategory(value: unknown): IdearioYAML['category'] {
  const valid: IdearioYAML['category'][] = ['product', 'business', 'creative', 'technical', 'personal'];
  return valid.includes(value as IdearioYAML['category']) ? (value as IdearioYAML['category']) : 'creative';
}

function validateNodeType(value: unknown): IdearioYAML['nodes'][number]['type'] {
  const valid: IdearioYAML['nodes'][number]['type'][] = ['concept', 'action', 'question', 'resource'];
  return valid.includes(value as IdearioYAML['nodes'][number]['type']) ? (value as IdearioYAML['nodes'][number]['type']) : 'concept';
}

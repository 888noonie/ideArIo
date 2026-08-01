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
    if (raw.length > 30_000) return null;

    // Strip markdown fences if the model added them
    const cleaned = raw
      .replace(/^```yaml\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    const parseOptions: yaml.LoadOptions & { maxAliasCount: number } = { maxAliasCount: 20 };
    const parsed = yaml.load(cleaned, parseOptions);
    if (!parsed || typeof parsed !== 'object') return null;

    const data = parsed as Partial<IdearioYAML>;

    // Validate required fields
    const title = cleanText(data.title, 120);
    if (!title || !Array.isArray(data.nodes) || data.nodes.length === 0 || data.nodes.length > 12) return null;

    const now = new Date().toISOString();
    const nodes: IdearioYAML['nodes'] = [];
    const ids = new Set<string>();

    for (const [index, value] of data.nodes.entries()) {
      if (!value || typeof value !== 'object') continue;
      const node = value as Partial<IdearioYAML['nodes'][number]>;
      const id = index === 0 ? 'core' : cleanNodeId(node.id, index);
      if (ids.has(id)) continue;
      ids.add(id);
      nodes.push({
        id,
        label: cleanText(node.label, 80) || 'Untitled',
        type: validateNodeType(node.type),
        connections: Array.isArray(node.connections) ? node.connections.map(String) : [],
      });
    }
    if (nodes.length === 0) return null;

    const validIds = new Set(nodes.map((node) => node.id));
    for (const node of nodes) {
      node.connections = [...new Set(node.connections)]
        .map((connection) => connection.trim().toLowerCase())
        .filter((connection) => connection !== node.id && validIds.has(connection));
    }

    return {
      title,
      category: validateCategory(data.category),
      summary: cleanText(data.summary, 500),
      tags: cleanTags(data.tags),
      nodes,
      created_at: validTimestamp(data.created_at) || now,
      updated_at: validTimestamp(data.updated_at) || now,
    };
  } catch {
    return null;
  }
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function cleanNodeId(value: unknown, index: number): string {
  const normalized = cleanText(value, 64).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  return /^[a-z][a-z0-9-]{0,63}$/.test(normalized) ? normalized : `node-${index}`;
}

function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((tag) => cleanText(tag, 40)).filter(Boolean))].slice(0, 8);
}

function validTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return null;
  return value;
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

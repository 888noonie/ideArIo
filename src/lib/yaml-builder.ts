import * as yaml from 'js-yaml';
import type { IdearioYAML } from '../types/ideario';
import { migrateIdeario, SCHEMA_VERSION } from './yaml-migrations';

export const SYSTEM_PROMPT = `You are Ario, the noble idea companion for Ideario.
Convert the user's spoken idea into a valid Ideario YAML object.

Schema (version ${SCHEMA_VERSION}):
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
context: (optional)
  location: string (optional, e.g. "driving on I-95")
  time: string (optional, ISO timestamp of capture)
  vehicle: string (optional, e.g. "Hyundai Tucson 2026")
artifacts: string[] (optional, URLs or references to external assets mentioned)
version: "${SCHEMA_VERSION}"
created_at: ISO timestamp (optional)
updated_at: ISO timestamp (optional)
---

Rules:
- Return ONLY valid YAML, no markdown fences, no explanations.
- The first node should have id "core" and type "concept".
- Create 3-7 nodes total.
- Make connections meaningful.
- If the idea is vague, create question nodes to explore it.
- Only include context/artifacts fields when the idea actually mentions them.`;

export function buildUserPrompt(transcript: string): string {
  return `Spoken idea: "${transcript}"`;
}

/**
 * Parse raw YAML text from the model into an IdearioYAML object.
 * Backward compatible: legacy v1.0 ideas (without transcript/context/
 * artifacts/version) are migrated via yaml-migrations.
 *
 * @param raw Raw YAML text (markdown fences tolerated).
 * @param transcript Optional original transcript to stamp onto the idea.
 */
export function parseIdearioYaml(raw: string, transcript?: string): IdearioYAML | null {
  try {
    // Strip reasoning-model think blocks (<think>...</think>) and any
    // preamble prose — reasoning models (DeepSeek Pro, Kimi) often emit
    // their reasoning before the actual YAML answer.
    let cleaned = raw
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/^```yaml\s*/im, '')
      .replace(/^```\s*/im, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    // If the response has prose before the YAML, start from the schema's
    // first key.
    if (!cleaned.startsWith('title:')) {
      const titleIdx = cleaned.search(/^title:/m);
      if (titleIdx >= 0) {
        cleaned = cleaned.slice(titleIdx);
      }
    }

    const parsed = yaml.load(cleaned);
    const migrated = migrateIdeario(parsed);
    if (!migrated) return null;

    // Stamp the original transcript if the model didn't include it.
    if (transcript && !migrated.transcript) {
      migrated.transcript = transcript;
    }

    return migrated;
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

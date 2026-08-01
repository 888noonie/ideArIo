import type { IdearioContext, IdearioYAML } from '../types/ideario';

/** Current Ideario YAML schema version. */
export const SCHEMA_VERSION = '1.1';

const VALID_CATEGORIES: IdearioYAML['category'][] = [
  'product',
  'business',
  'creative',
  'technical',
  'personal',
];

const VALID_NODE_TYPES: IdearioYAML['nodes'][number]['type'][] = [
  'concept',
  'action',
  'question',
  'resource',
];

export function migrateCategory(value: unknown): IdearioYAML['category'] {
  return VALID_CATEGORIES.includes(value as IdearioYAML['category'])
    ? (value as IdearioYAML['category'])
    : 'creative';
}

export function migrateNodeType(value: unknown): IdearioYAML['nodes'][number]['type'] {
  return VALID_NODE_TYPES.includes(value as IdearioYAML['nodes'][number]['type'])
    ? (value as IdearioYAML['nodes'][number]['type'])
    : 'concept';
}

function migrateContext(value: unknown): IdearioContext | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const context: IdearioContext = {};
  if (typeof raw.location === 'string' && raw.location) context.location = raw.location;
  if (typeof raw.time === 'string' && raw.time) context.time = raw.time;
  if (typeof raw.vehicle === 'string' && raw.vehicle) context.vehicle = raw.vehicle;
  return Object.keys(context).length > 0 ? context : undefined;
}

function migrateArtifacts(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const artifacts = value.map(String).filter(Boolean);
  return artifacts.length > 0 ? artifacts : undefined;
}

/**
 * Migrate any previously-saved Ideario object (legacy v1.0 or newer) to the
 * current schema. Legacy ideas simply lacked `transcript`, `context`,
 * `artifacts`, and `version` — they are filled with safe defaults so old
 * saves keep loading and rendering unchanged.
 *
 * Returns null when the data is not a valid idea at all.
 */
export function migrateIdeario(data: unknown): IdearioYAML | null {
  if (!data || typeof data !== 'object') return null;

  const raw = data as Record<string, unknown>;
  if (!raw.title || !Array.isArray(raw.nodes)) return null;

  const now = new Date().toISOString();
  const version = typeof raw.version === 'string' && raw.version ? raw.version : SCHEMA_VERSION;
  const context = migrateContext(raw.context);
  const artifacts = migrateArtifacts(raw.artifacts);

  return {
    title: String(raw.title),
    category: migrateCategory(raw.category),
    summary: String(raw.summary || ''),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    nodes: (raw.nodes as Record<string, unknown>[]).map((n, i) => ({
      id: String(n.id || `node-${i}`),
      label: String(n.label || 'Untitled'),
      type: migrateNodeType(n.type),
      connections: Array.isArray(n.connections) ? (n.connections as unknown[]).map(String) : [],
    })),
    ...(typeof raw.transcript === 'string' && raw.transcript ? { transcript: raw.transcript } : {}),
    ...(context ? { context } : {}),
    ...(artifacts ? { artifacts } : {}),
    version,
    created_at: typeof raw.created_at === 'string' && raw.created_at ? raw.created_at : now,
    updated_at: typeof raw.updated_at === 'string' && raw.updated_at ? raw.updated_at : now,
  };
}

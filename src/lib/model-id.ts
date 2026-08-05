// src/lib/model-id.ts
// Tiny accessors for the selected-model id. Deliberately does NOT import
// model-registry.ts — that 790-line module is lazy-loaded only by the
// Settings tab / ModelSelector / NIM provider. App.tsx imports only this.

export const DEFAULT_MODEL_ID = 'deepseek-ai/deepseek-v4-pro';
const SELECTED_MODEL_KEY = 'ideario-selected-model';

export function loadSelectedModelId(): string {
  try {
    const stored = localStorage.getItem(SELECTED_MODEL_KEY);
    if (stored) return stored; // validity checked by the registry on use
  } catch {
    // Ignore localStorage errors
  }
  return DEFAULT_MODEL_ID;
}

export function saveSelectedModelId(id: string): void {
  try {
    localStorage.setItem(SELECTED_MODEL_KEY, id);
  } catch {
    // Ignore localStorage errors
  }
}

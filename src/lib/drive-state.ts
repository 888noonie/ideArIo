export const DRIVE_STATE_CHANGED_EVENT = 'ideario-drive-state-changed';
const PARKED_KEY = 'ideario-parked';

export function isParked(): boolean {
  try {
    return window.localStorage.getItem(PARKED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function persistParked(value: boolean): void {
  try {
    window.localStorage.setItem(PARKED_KEY, String(value));
  } catch {
    // Ignore localStorage errors.
  }
  window.dispatchEvent(new CustomEvent(DRIVE_STATE_CHANGED_EVENT, { detail: value }));
}

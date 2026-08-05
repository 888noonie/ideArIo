export interface SpeechSettings {
  voiceURI?: string;
  voiceName?: string;
  rate?: number;
}

const SPEECH_SETTINGS_KEY = 'ideario-speech-settings';

export function loadSpeechSettings(): SpeechSettings {
  try {
    const raw = window.localStorage.getItem(SPEECH_SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const settings = parsed as Record<string, unknown>;
    return {
      voiceURI: typeof settings.voiceURI === 'string' ? settings.voiceURI : undefined,
      voiceName: typeof settings.voiceName === 'string' ? settings.voiceName : undefined,
      rate: typeof settings.rate === 'number' && settings.rate > 0 ? settings.rate : undefined,
    };
  } catch {
    return {};
  }
}

export function saveSpeechSettings(settings: SpeechSettings): void {
  try {
    window.localStorage.setItem(SPEECH_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable — fail silently
  }
}

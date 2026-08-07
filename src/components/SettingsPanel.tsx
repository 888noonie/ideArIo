import { useState, useCallback, useEffect, useRef } from 'react';
import { ModelSelector } from './ModelSelector';
import { ThemeSwitcher } from './ThemeSwitcher';
import {
  getApiKey,
  setApiKey,
  getOllamaBaseUrl,
  getOllamaMode,
  setOllamaBaseUrl,
  setOllamaMode,
  wipeKeysOnDevice,
  type OllamaMode,
} from '../lib/providers';
import { getBridgeSession } from '../lib/bridge/session';
import type { BridgeStatus } from '../lib/bridge/types';
import { sendSettingsSync } from '../lib/settings-sync';
import type { Theme } from '../lib/theme';
import type { ModelInfo } from '../lib/model-registry';
import type { ProviderId } from '../lib/providers/types';

interface SettingsPanelProps {
  theme: Theme;
  onToggleTheme: () => void;
  showDebug: boolean;
  onToggleDebug: () => void;
  selectedModelId: string;
  onModelChange: (model: ModelInfo) => void;
  onResetAgents: () => void;
  parked: boolean;
}

const GITHUB_TOKEN_KEY = 'ideario-github-token';
type CloudProviderId = Extract<ProviderId, 'openrouter' | 'groq' | 'gemini' | 'ofox'>;

const CLOUD_PROVIDERS: Array<{ id: CloudProviderId; label: string; placeholder: string; domain: string }> = [
  { id: 'openrouter', label: 'OpenRouter', placeholder: 'sk-or-...', domain: 'openrouter.ai' },
  { id: 'groq', label: 'Groq', placeholder: 'gsk_...', domain: 'api.groq.com' },
  { id: 'gemini', label: 'Google Gemini', placeholder: 'AIza...', domain: 'generativelanguage.googleapis.com' },
  { id: 'ofox', label: 'OfoxAI', placeholder: 'sk-of-...', domain: 'api.ofox.ai' },
];

function loadGithubToken(): string {
  try {
    return localStorage.getItem(GITHUB_TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveGithubToken(token: string): void {
  try {
    if (token) {
      localStorage.setItem(GITHUB_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(GITHUB_TOKEN_KEY);
    }
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Settings tab: BYOK provider keys (stored only in this browser), legacy NIM
 * model for idea capture, Gist token, theme, debug overlay, agent reset.
 */
export function SettingsPanel({
  theme,
  onToggleTheme,
  showDebug,
  onToggleDebug,
  selectedModelId,
  onModelChange,
  onResetAgents,
  parked,
}: SettingsPanelProps) {
  const [cloudKeys, setCloudKeys] = useState<Record<CloudProviderId, string>>(() => ({
    openrouter: getApiKey('openrouter') ?? '',
    groq: getApiKey('groq') ?? '',
    gemini: getApiKey('gemini') ?? '',
    ofox: getApiKey('ofox') ?? '',
  }));
  const [shownCloudKeys, setShownCloudKeys] = useState<Partial<Record<CloudProviderId, boolean>>>({});
  const [savedCloudKeys, setSavedCloudKeys] = useState<Partial<Record<CloudProviderId, boolean>>>({});
  const [ollamaUrl, setOllamaUrl] = useState(getOllamaBaseUrl);
  const [ollamaMode, setOllamaModeState] = useState<OllamaMode>(getOllamaMode);
  const [ollamaKey, setOllamaKey] = useState(() => getApiKey('ollama') ?? '');
  const [showOllamaKey, setShowOllamaKey] = useState(false);
  const [ollamaSaved, setOllamaSaved] = useState(false);
  const [ghToken, setGhToken] = useState(loadGithubToken);
  const [showGhToken, setShowGhToken] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [wipeArmed, setWipeArmed] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>(() => getBridgeSession().getStatus());
  const [syncStatus, setSyncStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const wipeTimerRef = useRef<number | null>(null);

  // Live bridge rung for the settings-sync gate.
  useEffect(() => {
    const session = getBridgeSession();
    session.onStatus(setBridgeStatus);
    setBridgeStatus(session.getStatus());
  }, []);

  useEffect(() => {
    return () => {
      if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
      if (wipeTimerRef.current !== null) window.clearTimeout(wipeTimerRef.current);
    };
  }, []);

  const syncReady = bridgeStatus.rung === 'webrtc' && bridgeStatus.connected;

  const handleSyncNow = useCallback(() => {
    const result = sendSettingsSync();
    setSyncStatus(
      result.sent
        ? { ok: true, text: 'Sync sent' }
        : { ok: false, text: result.reason ?? 'Sync failed' }
    );
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => setSyncStatus(null), 4000);
  }, []);

  const handleCloudKeyChange = useCallback((provider: CloudProviderId, value: string) => {
    setCloudKeys((current) => ({ ...current, [provider]: value }));
  }, []);

  const handleSaveCloudKey = useCallback((provider: CloudProviderId) => {
    setApiKey(provider, cloudKeys[provider].trim());
    setSavedCloudKeys((current) => ({ ...current, [provider]: true }));
    window.setTimeout(() => {
      setSavedCloudKeys((current) => ({ ...current, [provider]: false }));
    }, 2000);
  }, [cloudKeys]);

  const handleWipeKeys = useCallback(() => {
    if (!parked) return;
    if (!wipeArmed) {
      setWipeArmed(true);
      if (wipeTimerRef.current !== null) window.clearTimeout(wipeTimerRef.current);
      wipeTimerRef.current = window.setTimeout(() => setWipeArmed(false), 5000);
      return;
    }

    wipeKeysOnDevice();
    setCloudKeys({ openrouter: '', groq: '', gemini: '', ofox: '' });
    setOllamaKey('');
    setShowOllamaKey(false);
    setGhToken('');
    setShownCloudKeys({});
    setShowGhToken(false);
    setSavedCloudKeys({});
    setWipeArmed(false);
    if (wipeTimerRef.current !== null) {
      window.clearTimeout(wipeTimerRef.current);
      wipeTimerRef.current = null;
    }
    setSyncStatus({ ok: true, text: 'Keys wiped from this device.' });
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => setSyncStatus(null), 4000);
  }, [parked, wipeArmed]);

  const handleSaveOllama = useCallback(() => {
    setOllamaBaseUrl(ollamaUrl.trim() || 'http://localhost:11434');
    setOllamaMode(ollamaMode);
    setApiKey('ollama', ollamaKey);
    setOllamaSaved(true);
    window.setTimeout(() => setOllamaSaved(false), 2000);
  }, [ollamaKey, ollamaMode, ollamaUrl]);

  const handleGhTokenChange = useCallback((value: string) => {
    setGhToken(value);
    saveGithubToken(value.trim());
  }, []);

  const sectionClass = 'rounded-3xl bg-ario-grey border border-white/5 p-6 space-y-4';
  const headingClass = 'text-lg font-semibold text-ario-text';
  const hintClass = 'text-ario-muted/80 text-sm leading-relaxed';
  const inputClass =
    'w-full min-h-14 px-4 rounded-2xl bg-ario-card text-ario-text text-base ' +
    'border border-white/10 placeholder:text-ario-muted/60 ' +
    'focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50';
  const smallButtonClass =
    'min-h-14 px-5 rounded-2xl bg-ario-card border border-white/10 text-ario-text text-sm ' +
    'font-medium whitespace-nowrap transition-colors hover:border-ario-turquoise/50 ' +
    'focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50';

  const providerKeyCount = CLOUD_PROVIDERS.filter(({ id }) => Boolean(getApiKey(id))).length;

  return (
    <div className="h-full overflow-y-auto chat-scroll">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <h2 className="text-2xl font-semibold text-ario-text">Settings</h2>

        {/* Cloud BYOK */}
        {CLOUD_PROVIDERS.map((provider) => (
          <section key={provider.id} className={sectionClass}>
            <h3 className={headingClass}>{provider.label} API key</h3>
            <p className={hintClass}>
              Used by {provider.label} agents for chat. Stored only in this browser — never
              committed, never sent anywhere except {provider.domain}.
            </p>
            {parked ? (
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    type={shownCloudKeys[provider.id] ? 'text' : 'password'}
                    value={cloudKeys[provider.id]}
                    onChange={(event) => handleCloudKeyChange(provider.id, event.target.value)}
                    placeholder={provider.placeholder}
                    autoComplete="off"
                    className={inputClass}
                    style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                    aria-label={`${provider.label} API key`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShownCloudKeys((current) => ({
                    ...current,
                    [provider.id]: !current[provider.id],
                  }))}
                  className={smallButtonClass}
                  aria-label={shownCloudKeys[provider.id] ? `Hide ${provider.label} API key` : `Show ${provider.label} API key`}
                >
                  {shownCloudKeys[provider.id] ? 'Hide' : 'Show'}
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveCloudKey(provider.id)}
                  className={smallButtonClass}
                >
                  {savedCloudKeys[provider.id] ? 'Saved' : 'Save'}
                </button>
              </div>
            ) : (
              <div className="rounded-2xl bg-amber-400/10 border border-amber-400/40 p-4 text-amber-200 text-sm">
                {providerKeyCount > 0
                  ? `${providerKeyCount} key${providerKeyCount === 1 ? '' : 's'} stored — park to edit`
                  : 'Park to set provider keys.'}
              </div>
            )}
          </section>
        ))}

        {/* Ollama */}
        <section className={sectionClass}>
          <h3 className={headingClass}>Ollama</h3>
          <p className={hintClass}>
            {ollamaMode === 'cloud'
              ? 'Cloud calls go directly to ollama.com with your Ollama API key.'
              : <>Run Ollama with <code className="text-ario-turquoise">OLLAMA_ORIGINS=*</code> (or your Vercel origin) to allow browser calls.</>}
          </p>
          {parked ? (
            <>
              <div className="grid grid-cols-2 gap-3" role="group" aria-label="Ollama connection mode">
                {(['local', 'cloud'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setOllamaModeState(mode)}
                    aria-pressed={ollamaMode === mode}
                    className={`min-h-14 rounded-2xl border text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50 ${
                      ollamaMode === mode
                        ? 'bg-ario-turquoise/15 border-ario-turquoise/50 text-ario-turquoise'
                        : 'bg-ario-card border-white/10 text-ario-muted hover:border-ario-turquoise/30'
                    }`}
                  >
                    {mode === 'local' ? 'Local Ollama' : 'Ollama Cloud'}
                  </button>
                ))}
              </div>
              {ollamaMode === 'cloud' ? (
                <div className="flex gap-3">
                  <input
                    type={showOllamaKey ? 'text' : 'password'}
                    value={ollamaKey}
                    onChange={(event) => setOllamaKey(event.target.value)}
                    placeholder="Ollama API key"
                    autoComplete="off"
                    className={inputClass}
                    style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                    aria-label="Ollama Cloud API key"
                  />
                  <button type="button" onClick={() => setShowOllamaKey((shown) => !shown)} className={smallButtonClass}>
                    {showOllamaKey ? 'Hide' : 'Show'}
                  </button>
                </div>
              ) : (
                <input
                  type="url"
                  value={ollamaUrl}
                  onChange={(event) => setOllamaUrl(event.target.value)}
                  placeholder="http://localhost:11434"
                  autoComplete="off"
                  className={inputClass}
                  style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                  aria-label="Local Ollama base URL"
                />
              )}
              <button type="button" onClick={handleSaveOllama} className={smallButtonClass}>
                {ollamaSaved ? 'Saved' : 'Save Ollama settings'}
              </button>
            </>
          ) : (
            <div className="rounded-2xl bg-amber-400/10 border border-amber-400/40 p-4 text-amber-200 text-sm">
              Park to change Ollama connection settings.
            </div>
          )}
        </section>

        {/* NIM legacy */}
        <section className={sectionClass}>
          <h3 className={headingClass}>NVIDIA NIM (legacy)</h3>
          <p className={hintClass}>
            NIM uses a server-side key via the /api/nim-proxy function — no browser key needed.
            This model powers voice idea capture (Capture tab).
          </p>
          <div className="flex items-center gap-3">
            <span className="text-ario-muted text-sm">Capture model</span>
            <ModelSelector selectedModelId={selectedModelId} onSelect={onModelChange} />
          </div>
        </section>

        {/* GitHub Gist token */}
        <section className={sectionClass}>
          <h3 className={headingClass}>GitHub Gist token (optional)</h3>
          <p className={hintClass}>
            Enables syncing ideas to a GitHub Gist. Not needed for pairing —
            the Bridge relay handles that server-side. The token is stored in
            this browser only and is never bundled into the app.
          </p>
          <div className="flex gap-3">
            <input
              type={showGhToken ? 'text' : 'password'}
              value={ghToken}
              onChange={(e) => handleGhTokenChange(e.target.value)}
              placeholder="ghp_..."
              autoComplete="off"
              className={inputClass}
              style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
              aria-label="GitHub Gist token"
            />
            <button
              type="button"
              onClick={() => setShowGhToken((v) => !v)}
              className={smallButtonClass}
              aria-label={showGhToken ? 'Hide GitHub token' : 'Show GitHub token'}
            >
              {showGhToken ? 'Hide' : 'Show'}
            </button>
          </div>
        </section>

        {/* Appearance + debug */}
        <section className={sectionClass}>
          <h3 className={headingClass}>Appearance & diagnostics</h3>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-ario-text text-base">Theme</p>
              <p className={hintClass}>Neon Turquoise (dark) or Light Edition.</p>
            </div>
            <ThemeSwitcher theme={theme} onToggle={onToggleTheme} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-ario-text text-base">Debug overlay</p>
              <p className={hintClass}>Viewport, touch-target and state diagnostics.</p>
            </div>
            <button
              type="button"
              onClick={onToggleDebug}
              aria-pressed={showDebug}
              className={`min-h-14 px-5 rounded-2xl border text-sm font-medium transition-colors
                         focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50
                         ${showDebug
                           ? 'bg-ario-turquoise/15 border-ario-turquoise/50 text-ario-turquoise'
                           : 'bg-ario-card border-white/10 text-ario-muted hover:border-ario-turquoise/30'}`}
            >
              {showDebug ? 'On' : 'Off'}
            </button>
          </div>
        </section>

        {/* Settings sync to paired display (hub → display, WebRTC rung only) */}
        <section className={sectionClass}>
          <h3 className={headingClass}>Sync settings to paired display</h3>
          <p className={hintClass}>
            Pushes provider keys, Ollama URL, theme and the capture model to the
            paired car display.
          </p>
          {!syncReady && (
            <p className="text-amber-300/90 text-sm leading-relaxed">
              Settings sync needs the WebRTC rung (keys never transit the Gist mailbox).
              Pair in the Bridge tab and wait for the WebRTC rung to connect.
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={!syncReady}
              className="ario-button bg-ario-turquoise/15 border-ario-turquoise/50 text-ario-turquoise
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Sync now
            </button>
            {syncStatus && (
              <span
                role="status"
                className={`text-sm ${syncStatus.ok ? 'text-ario-turquoise' : 'text-ario-red'}`}
              >
                {syncStatus.text}
              </span>
            )}
          </div>
        </section>

        {/* Wipe secret keys */}
        <section className={sectionClass}>
          <h3 className={headingClass}>Wipe keys on this device</h3>
          <p className={hintClass}>
            Remove only the provider keys and GitHub Gist token stored in this browser.
            Preferences and saved ideas are not touched.
          </p>
          <button
            type="button"
            onClick={handleWipeKeys}
            disabled={!parked}
            className={`w-full min-h-14 rounded-2xl border text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50
                       ${parked
                         ? 'bg-ario-red/10 border-ario-red/40 text-ario-red hover:bg-ario-red/15'
                         : 'bg-amber-400/10 border-amber-400/40 text-amber-200 cursor-not-allowed'}`}
            title={parked ? (wipeArmed ? 'Tap again to confirm wipe' : 'Wipe keys from this device') : 'Park to wipe keys'}
          >
            {wipeArmed ? 'Tap again to confirm wipe' : 'Wipe keys on this device'}
          </button>
        </section>

        {/* Reset agents */}
        <section className={sectionClass}>
          <h3 className={headingClass}>Agents</h3>
          <p className={hintClass}>
            Restore the default agents (Kimi, DeepSeek, Ario Local). Custom agents are removed.
          </p>
          {confirmReset ? (
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setConfirmReset(false)} className="ario-button">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onResetAgents();
                  setConfirmReset(false);
                }}
                className="ario-button bg-ario-red/15 border-ario-red/50 text-ario-red"
              >
                Confirm reset
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="ario-button w-full"
            >
              Reset agents to defaults
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

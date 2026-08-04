import { useState, useCallback, useEffect, useRef } from 'react';
import { ModelSelector } from './ModelSelector';
import { ThemeSwitcher } from './ThemeSwitcher';
import { getApiKey, setApiKey, getOllamaBaseUrl, setOllamaBaseUrl } from '../lib/providers';
import { getBridgeSession } from '../lib/bridge/session';
import type { BridgeStatus } from '../lib/bridge/types';
import { sendSettingsSync } from '../lib/settings-sync';
import type { Theme } from '../lib/theme';
import type { ModelInfo } from '../lib/model-registry';

interface SettingsPanelProps {
  theme: Theme;
  onToggleTheme: () => void;
  showDebug: boolean;
  onToggleDebug: () => void;
  selectedModelId: string;
  onModelChange: (model: ModelInfo) => void;
  onResetAgents: () => void;
}

const GITHUB_TOKEN_KEY = 'ideario-github-token';

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
}: SettingsPanelProps) {
  const [orKey, setOrKey] = useState(() => getApiKey('openrouter') ?? '');
  const [showOrKey, setShowOrKey] = useState(false);
  const [orSaved, setOrSaved] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState(getOllamaBaseUrl);
  const [ollamaSaved, setOllamaSaved] = useState(false);
  const [ghToken, setGhToken] = useState(loadGithubToken);
  const [showGhToken, setShowGhToken] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>(() => getBridgeSession().getStatus());
  const [syncStatus, setSyncStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const syncTimerRef = useRef<number | null>(null);

  // Live bridge rung for the settings-sync gate.
  useEffect(() => {
    const session = getBridgeSession();
    session.onStatus(setBridgeStatus);
    setBridgeStatus(session.getStatus());
  }, []);

  useEffect(() => {
    return () => {
      if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
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

  const handleSaveOrKey = useCallback(() => {
    setApiKey('openrouter', orKey.trim());
    setOrSaved(true);
    window.setTimeout(() => setOrSaved(false), 2000);
  }, [orKey]);

  const handleSaveOllama = useCallback(() => {
    setOllamaBaseUrl(ollamaUrl.trim() || 'http://localhost:11434');
    setOllamaSaved(true);
    window.setTimeout(() => setOllamaSaved(false), 2000);
  }, [ollamaUrl]);

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

  return (
    <div className="h-full overflow-y-auto chat-scroll">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <h2 className="text-2xl font-semibold text-ario-text">Settings</h2>

        {/* OpenRouter BYOK */}
        <section className={sectionClass}>
          <h3 className={headingClass}>OpenRouter API key</h3>
          <p className={hintClass}>
            Used by OpenRouter agents for chat. Stored only in this browser — never
            committed, never sent anywhere except openrouter.ai.
          </p>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input
                type={showOrKey ? 'text' : 'password'}
                value={orKey}
                onChange={(e) => setOrKey(e.target.value)}
                placeholder="sk-or-..."
                autoComplete="off"
                className={inputClass}
                style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                aria-label="OpenRouter API key"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowOrKey((v) => !v)}
              className={smallButtonClass}
              aria-label={showOrKey ? 'Hide API key' : 'Show API key'}
            >
              {showOrKey ? 'Hide' : 'Show'}
            </button>
            <button type="button" onClick={handleSaveOrKey} className={smallButtonClass}>
              {orSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </section>

        {/* Ollama */}
        <section className={sectionClass}>
          <h3 className={headingClass}>Ollama (local)</h3>
          <p className={hintClass}>
            Run Ollama with <code className="text-ario-turquoise">OLLAMA_ORIGINS=*</code> (or your
            Vercel origin) to allow browser calls.
          </p>
          <div className="flex gap-3">
            <input
              type="url"
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              placeholder="http://localhost:11434"
              autoComplete="off"
              className={inputClass}
              style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
              aria-label="Ollama base URL"
            />
            <button type="button" onClick={handleSaveOllama} className={smallButtonClass}>
              {ollamaSaved ? 'Saved' : 'Save'}
            </button>
          </div>
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
            Enables syncing ideas to a GitHub Gist. If the VITE_GITHUB_TOKEN env var is set at
            build time, it takes precedence over this field.
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
            Pushes provider keys, Ollama URL, agents, theme and the capture model to the
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

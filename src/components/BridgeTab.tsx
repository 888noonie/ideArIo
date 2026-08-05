import { useState, useEffect, useCallback, useRef } from 'react';
import { getBridgeSession } from '../lib/bridge/session';
import type { BridgeRole, BridgeRung, BridgeStatus } from '../lib/bridge/types';
import { loadTrust, saveTrust, type TrustState } from '../lib/trust';
import { isCrewAudioEnabled, setCrewAudioEnabled } from '../lib/crew-audio';
import { loadQueue, removeFromQueue, type QueuedLink } from '../lib/link-queue';
import { LINK_QUEUE_CHANGED_EVENT, TRUST_CHANGED_EVENT } from './reflex-helpers';

interface BridgeTabProps {
  paired: boolean;
  onPairedChange: (on: boolean) => void;
}

type RoleChoice = 'off' | BridgeRole;

const RUNG_META: Record<BridgeRung, { label: string; dot: string }> = {
  webrtc: { label: 'WebRTC', dot: 'bg-ario-turquoise' },
  mailbox: { label: 'Mailbox', dot: 'bg-amber-400' },
  offline: { label: 'Offline', dot: 'bg-ario-red' },
};

const TRUST_OPTIONS: { id: TrustState; label: string }[] = [
  { id: 'suggest', label: 'Suggest' },
  { id: 'co_pilot', label: 'Co-pilot' },
  { id: 'autonomous', label: 'Autonomous' },
];

function randomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function lastSeenLabel(lastPeerSeen: number | null, now: number): string {
  if (!lastPeerSeen) return 'No peer seen yet';
  const seconds = Math.max(0, Math.round((now - lastPeerSeen) / 1000));
  if (seconds < 5) return 'Peer seen just now';
  if (seconds < 60) return `Peer seen ${seconds}s ago`;
  return `Peer seen ${Math.round(seconds / 60)}m ago`;
}

/**
 * Bridge control room: pair the phone (hub) with a car display (display),
 * watch the transport ladder status, and tune trust / crew audio / paired
 * mode / the eyes-free link queue.
 */
export function BridgeTab({ paired, onPairedChange }: BridgeTabProps) {
  const session = getBridgeSession();
  const [status, setStatus] = useState<BridgeStatus>(() => session.getStatus());
  const [roleChoice, setRoleChoice] = useState<RoleChoice>(() => session.getStatus().role ?? 'off');
  // F5 uncontrolled pattern: the Fermata virtual keyboard does not reliably
  // drive controlled React inputs, so the code input owns its own value
  // (defaultValue + ref). joinCode only mirrors it (via onInput) for the
  // Join button's validation display — the real value is read from the ref.
  const joinInputRef = useRef<HTMLInputElement>(null);
  const [joinCode, setJoinCode] = useState('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [trust, setTrustState] = useState<TrustState>(() => loadTrust().trust);
  const [crewAudio, setCrewAudio] = useState<boolean>(() => isCrewAudioEnabled());
  const [queue, setQueue] = useState<QueuedLink[]>(() => loadQueue());
  const [now, setNow] = useState(() => Date.now());
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Live bridge status.
  useEffect(() => {
    const s = sessionRef.current;
    s.onStatus(setStatus);
    setStatus(s.getStatus());
  }, []);

  // Keep "peer seen Ns ago" fresh.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Same-tab sync for trust + link queue (reflex lane can change both).
  useEffect(() => {
    const reloadQueue = () => setQueue(loadQueue());
    const reloadTrust = () => setTrustState(loadTrust().trust);
    window.addEventListener(LINK_QUEUE_CHANGED_EVENT, reloadQueue);
    window.addEventListener(TRUST_CHANGED_EVENT, reloadTrust);
    return () => {
      window.removeEventListener(LINK_QUEUE_CHANGED_EVENT, reloadQueue);
      window.removeEventListener(TRUST_CHANGED_EVENT, reloadTrust);
    };
  }, []);

  const handleRoleChoice = useCallback((choice: RoleChoice) => {
    setRoleChoice(choice);
    setStartError(null);
    if (choice === 'off') {
      sessionRef.current.stop();
    }
  }, []);

  const handleGenerateCode = useCallback(async () => {
    setStarting(true);
    setStartError(null);
    try {
      await sessionRef.current.start('hub', randomCode());
    } catch (error) {
      setStartError(error instanceof Error ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  }, []);

  const handleJoin = useCallback(async () => {
    // Read + sanitize from the DOM ref on submit (not per-keystroke state).
    const code = (joinInputRef.current?.value ?? '').replace(/\D/g, '');
    if (!/^\d{6}$/.test(code)) {
      setStartError('Enter the 6-digit code shown on the phone hub.');
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      await sessionRef.current.start('display', code);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  }, []);

  const handleStop = useCallback(() => {
    sessionRef.current.stop();
    setRoleChoice('off');
    if (joinInputRef.current) joinInputRef.current.value = '';
    setJoinCode('');
    setStartError(null);
  }, []);

  const handleTrustChange = useCallback((next: TrustState) => {
    saveTrust({ ...loadTrust(), trust: next });
    setTrustState(next);
  }, []);

  const handleCrewAudioToggle = useCallback(() => {
    setCrewAudio((prev) => {
      const next = !prev;
      setCrewAudioEnabled(next);
      return next;
    });
  }, []);

  const handleRemoveLink = useCallback((id: string) => {
    setQueue(removeFromQueue(id));
  }, []);

  const handleOpenLink = useCallback((url: string) => {
    // Scheme allowlist: only web URLs may be opened (blocks javascript:,
    // data:, file: etc. if a malformed payload ever enters the queue).
    if (!/^https?:\/\//i.test(url)) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  // S-02: user confirms the 4-digit SAS code matches on both devices.
  const handleConfirmSas = useCallback(() => {
    sessionRef.current.confirmSas();
  }, []);

  const rung = RUNG_META[status.rung];
  const active = status.role !== null;

  return (
    <div className="h-full min-h-0 overflow-y-auto chat-scroll overscroll-contain px-4 py-4 space-y-4">
      {/* Role picker */}
      <section className="ario-panel p-4" aria-label="Bridge role">
        <h2 className="text-ario-text text-lg font-semibold mb-1">Bridge</h2>
        <p className="text-ario-muted text-sm mb-3">
          Pair this device with your phone. Off keeps everything local.
        </p>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Bridge role">
          {(
            [
              { id: 'off', label: 'Off' },
              { id: 'hub', label: 'Phone hub' },
              { id: 'display', label: 'Display' },
            ] as { id: RoleChoice; label: string }[]
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleRoleChoice(opt.id)}
              aria-pressed={roleChoice === opt.id}
              className={`min-h-14 px-3 rounded-2xl border text-sm font-medium transition-colors
                         focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50
                         ${roleChoice === opt.id
                           ? 'bg-ario-turquoise/15 border-ario-turquoise/50 text-ario-turquoise'
                           : 'bg-ario-card border-white/10 text-ario-muted hover:border-ario-turquoise/30'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Pairing flows */}
        {roleChoice === 'hub' && !active && (
          <button
            type="button"
            onClick={handleGenerateCode}
            disabled={starting}
            className="mt-3 w-full min-h-14 rounded-2xl bg-ario-turquoise/15 border border-ario-turquoise/50
                       text-ario-turquoise text-base font-semibold transition-all active:scale-95
                       hover:bg-ario-turquoise/25 focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50
                       disabled:opacity-40"
          >
            {starting ? 'Starting...' : 'Generate code'}
          </button>
        )}

        {roleChoice === 'display' && !active && (
          <div className="mt-3 flex items-center gap-3">
            <input
              ref={joinInputRef}
              type="text"
              inputMode="numeric"
              maxLength={6}
              defaultValue=""
              onInput={(e) => setJoinCode(e.currentTarget.value.replace(/\D/g, ''))}
              placeholder="6-digit code"
              aria-label="6-digit pairing code"
              className="flex-1 min-h-14 px-5 rounded-2xl bg-ario-card text-ario-text text-xl tracking-[0.4em]
                         text-center border border-white/10 placeholder:text-ario-muted/50 placeholder:text-base placeholder:tracking-normal
                         focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
              style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
            />
            <button
              type="button"
              onClick={handleJoin}
              disabled={starting || joinCode.length !== 6}
              className="min-h-14 px-6 rounded-2xl bg-ario-turquoise/15 border border-ario-turquoise/50
                         text-ario-turquoise text-base font-semibold transition-all active:scale-95
                         hover:bg-ario-turquoise/25 focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50
                         disabled:opacity-40"
            >
              Join
            </button>
          </div>
        )}

        {startError && (
          <p className="mt-3 text-ario-red text-sm" role="alert">{startError}</p>
        )}
      </section>

      {/* Live status card */}
      {active && (
        <section className="ario-panel p-4" aria-label="Bridge status">
          {status.role === 'hub' && status.code && (
            <div className="mb-4 text-center">
              <p className="text-ario-muted text-sm mb-1">Enter this code on the display</p>
              <p className="text-ario-turquoise text-6xl font-bold tracking-[0.3em] pl-2 select-all">
                {status.code}
              </p>
            </div>
          )}
          {status.role === 'display' && status.code && (
            <p className="text-ario-muted text-sm mb-3 text-center">
              Joined hub code <span className="text-ario-text font-semibold tracking-widest">{status.code}</span>
            </p>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full flex-none ${rung.dot}`} aria-hidden="true" />
              <span className="text-ario-text text-base font-semibold">{rung.label}</span>
              <span className={`text-sm ${status.connected ? 'text-ario-turquoise' : 'text-ario-muted'}`}>
                {status.connected ? 'connected' : 'waiting for peer'}
              </span>
            </div>
            <span className="text-ario-muted text-sm">
              {lastSeenLabel(status.lastPeerSeen, now)}
            </span>
          </div>

          {/* F-08: honest "still trying to upgrade" surface instead of a
              silent indefinite re-probe loop. */}
          {status.upgrading && status.rung === 'mailbox' && (
            <p className="mt-3 text-ario-muted text-sm" role="status">
              Still trying to upgrade to a direct connection…
            </p>
          )}

          {/* S-02: SAS peer verification. Show the 4-digit code on both
              devices; keys won't sync until the user confirms it matches. */}
          {status.rung === 'webrtc' && status.sas !== null && (
            <div className="mt-4 rounded-2xl bg-ario-card border border-white/10 p-4 text-center">
              <p className="text-ario-muted text-sm mb-1">
                {status.sasVerified
                  ? 'Connection verified — keys can sync.'
                  : 'Confirm this code matches the other device:'}
              </p>
              <p className="text-ario-turquoise text-5xl font-bold tracking-[0.3em] pl-2 select-all">
                {status.sas}
              </p>
              {!status.sasVerified && (
                <button
                  type="button"
                  onClick={handleConfirmSas}
                  className="mt-4 w-full min-h-14 rounded-2xl bg-ario-turquoise/15 border border-ario-turquoise/50
                             text-ario-turquoise text-base font-semibold transition-all active:scale-95
                             hover:bg-ario-turquoise/25 focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
                >
                  Code matches
                </button>
              )}
            </div>
          )}
          {status.rung === 'webrtc' && status.sas === null && (
            <p className="mt-3 text-ario-muted text-sm" role="status">
              Couldn't verify this connection — keys won't sync until it's re-paired.
            </p>
          )}

          <button
            type="button"
            onClick={handleStop}
            className="mt-4 w-full min-h-14 rounded-2xl bg-ario-red/10 border border-ario-red/40
                       text-ario-text text-base font-medium transition-colors
                       hover:border-ario-red/70 focus:outline-none focus:ring-2 focus:ring-ario-red/50"
          >
            Stop bridge
          </button>
        </section>
      )}

      {/* Trust state */}
      <section className="ario-panel p-4" aria-label="Trust state">
        <h2 className="text-ario-text text-lg font-semibold mb-1">Trust</h2>
        <p className="text-ario-muted text-sm mb-3">
          Crew waits to be called — default: suggest.
        </p>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Trust state">
          {TRUST_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleTrustChange(opt.id)}
              aria-pressed={trust === opt.id}
              className={`min-h-14 px-3 rounded-2xl border text-sm font-medium transition-colors
                         focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50
                         ${trust === opt.id
                           ? 'bg-ario-turquoise/15 border-ario-turquoise/50 text-ario-turquoise'
                           : 'bg-ario-card border-white/10 text-ario-muted hover:border-ario-turquoise/30'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* Toggles */}
      <section className="ario-panel p-4 space-y-3" aria-label="Bridge options">
        <button
          type="button"
          onClick={handleCrewAudioToggle}
          aria-pressed={crewAudio}
          className={`w-full min-h-14 px-4 rounded-2xl border text-sm font-medium transition-colors
                     flex items-center justify-between gap-3
                     focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50
                     ${crewAudio
                       ? 'bg-ario-turquoise/15 border-ario-turquoise/50 text-ario-turquoise'
                       : 'bg-ario-card border-white/10 text-ario-muted hover:border-ario-turquoise/30'}`}
        >
          <span>Crew audio — agents speak replies</span>
          <span className="font-semibold">{crewAudio ? 'ON' : 'OFF'}</span>
        </button>

        <button
          type="button"
          onClick={() => onPairedChange(!paired)}
          aria-pressed={paired}
          className={`w-full min-h-14 px-4 rounded-2xl border text-sm font-medium transition-colors
                     flex items-center justify-between gap-3
                     focus:outline-none focus:ring-2 focus:ring-amber-400/50
                     ${paired
                       ? 'bg-amber-400/15 border-amber-400/50 text-amber-300'
                       : 'bg-ario-card border-white/10 text-ario-muted hover:border-amber-400/30'}`}
        >
          <span>Paired mode — larger text, links queue for later</span>
          <span className="font-semibold">{paired ? 'ON' : 'OFF'}</span>
        </button>
      </section>

      {/* Link queue */}
      <section className="ario-panel p-4" aria-label="Link queue">
        <h2 className="text-ario-text text-lg font-semibold mb-1">Link queue</h2>
        <p className="text-ario-muted text-sm mb-3">
          Links queued eyes-free land here. Open them when you are parked.
        </p>
        {queue.length === 0 ? (
          <p className="text-ario-muted/70 text-sm py-2">Queue is empty.</p>
        ) : (
          <ul className="space-y-2">
            {queue.map((link) => (
              <li
                key={link.id}
                className="rounded-2xl bg-ario-card border border-white/10 px-4 py-3"
              >
                <p className="text-ario-text text-sm break-all">{link.url}</p>
                <p className="text-ario-muted/70 text-xs mt-1">
                  {link.note ? `${link.note} — ` : ''}
                  {new Date(link.ts).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => handleOpenLink(link.url)}
                    className="flex-1 min-h-14 rounded-2xl bg-ario-turquoise/15 border border-ario-turquoise/50
                               text-ario-turquoise text-sm font-medium transition-colors
                               hover:bg-ario-turquoise/25 focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveLink(link.id)}
                    className="flex-1 min-h-14 rounded-2xl bg-ario-card border border-white/10
                               text-ario-muted text-sm font-medium transition-colors
                               hover:border-ario-red/50 hover:text-ario-text
                               focus:outline-none focus:ring-2 focus:ring-ario-red/50"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

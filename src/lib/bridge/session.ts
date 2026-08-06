/**
 * Bridge session: the probe-and-degrade transport ladder.
 *
 *   WebRTC DataChannel  -> rung 'webrtc'  (instant, mailbox drops to 30s keepalive)
 *   Gist mailbox        -> rung 'mailbox' (4s poll)
 *   stopped / no token  -> rung 'offline'
 *
 * The hub creates the mailbox and the WebRTC offer (STUN
 * stun.l.google.com:19302); the display answers. Complete SDP descriptions ride
 * in 'signal' envelopes through the mailbox until the DataChannel
 * opens. Every 30s the hub silently re-probes (re-offers) while still
 * on the mailbox rung, so an upgrade happens without user action.
 * DC close/error, or a browser without RTCPeerConnection, degrades back
 * to the mailbox rung.
 *
 * lastPeerSeen updates on ANY inbound envelope or DataChannel message;
 * connected flips false after 20s of silence. Outbound envelopes are
 * buffered (max 20) while disconnected and flushed on connect.
 */

import type {
  BridgeEnvelope,
  BridgeRole,
  BridgeStatus,
  SignalPayload,
} from './types';
import { isValidBridgePayload, isValidEnvelope } from './validate';
import { openMailbox, type Mailbox } from './mailbox';
import { openRelayMailbox, type RelayCredentials } from './relay-mailbox';

const MAILBOX_POLL_MS = 4_000;
const KEEPALIVE_POLL_MS = 30_000;
const REPROBE_MS = 30_000;
const PING_MS = 15_000;
const SILENCE_CHECK_MS = 5_000;
const SILENCE_TIMEOUT_MS = 20_000;
const OUTBOUND_BUFFER_MAX = 20;
const SEEN_IDS_MAX = 500;

// WebRTC re-offer backoff (F-08): the hub re-probes every REPROBE_MS while
// stuck on the mailbox rung, but after a few consecutive failed upgrades it
// backs off exponentially up to REPROBE_BACKOFF_MAX_MS so a restrictive
// carrier NAT can't cause runaway RTCPeerConnection churn forever.
const REPROBE_FAILURES_BEFORE_BACKOFF = 2;
const REPROBE_BACKOFF_MAX_MS = 300_000; // 5 min cap

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export interface BridgeSession {
  /** Hub creates a fresh relay room; an optional `code` is ignored in relay mode. */
  start(role: 'hub', code?: string): Promise<void>;
  /** Display joins an existing relay room using the 6-digit code. */
  start(role: 'display', code: string): Promise<void>;
  start(role: BridgeRole, code?: string): Promise<void>;
  stop(): void;
  send(type: BridgeEnvelope['type'], payload: unknown): void;
  onMessage(cb: (env: BridgeEnvelope) => void): void;
  onStatus(cb: (s: BridgeStatus) => void): void;
  getStatus(): BridgeStatus;
  /** S-02: mark the 4-digit SAS code as confirmed by the user. */
  confirmSas(): void;
}

const RELAY_URL = (import.meta.env.VITE_BRIDGE_RELAY_URL as string | undefined) ?? '/api/bridge-relay';

function hasLocalGistToken(): boolean {
  try {
    const stored = window.localStorage.getItem('ideario-github-token');
    return Boolean(stored && stored.trim());
  } catch {
    return false;
  }
}

async function createRelayRoom(): Promise<RelayCredentials> {
  const response = await fetch(`${RELAY_URL}?action=create`, { method: 'POST' });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Bridge relay create failed (HTTP ${response.status}). ${text.slice(0, 120)}`.trim());
  }
  const data = (await response.json()) as { code: string; roomId: string; hubSecret: string };
  if (!data.code || !data.roomId || !data.hubSecret) {
    throw new Error('Bridge relay returned an incomplete room.');
  }
  return { code: data.code, roomId: data.roomId, hubSecret: data.hubSecret };
}

async function joinRelayRoom(code: string): Promise<RelayCredentials> {
  const response = await fetch(`${RELAY_URL}?action=join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (response.status === 404) {
    throw new Error('Pairing code not found — check the code shown on the phone.');
  }
  if (response.status === 409) {
    throw new Error('This code is already in use on another display.');
  }
  if (response.status === 410) {
    throw new Error('Pairing code expired — generate a new one on the phone.');
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Bridge relay join failed (HTTP ${response.status}). ${text.slice(0, 120)}`.trim());
  }
  const data = (await response.json()) as { roomId: string; displaySecret: string };
  if (!data.roomId || !data.displaySecret) {
    throw new Error('Bridge relay returned an incomplete join response.');
  }
  return { code, roomId: data.roomId, displaySecret: data.displaySecret };
}

async function openMailboxForRole(role: BridgeRole, code: string): Promise<{ mailbox: Mailbox; code: string }> {
  // Relay mode is the default. VITE_BRIDGE_RELAY_URL can be set to an empty
  // string to force the legacy direct-Gist transport (both sides must then
  // have a local token).
  if (RELAY_URL) {
    if (role === 'hub') {
      const creds = await createRelayRoom();
      return { mailbox: openRelayMailbox(creds), code: creds.code };
    }
    const creds = await joinRelayRoom(code);
    return { mailbox: openRelayMailbox(creds), code };
  }

  // Legacy direct-Gist fallback: requires a token on this device.
  if (!hasLocalGistToken()) {
    throw new Error(
      'Bridge needs either the Ario relay or a GitHub token in Settings (Gist token).'
    );
  }
  return { mailbox: await openMailbox(code), code };
}

function createEnvelopeId(): string {
  return `env-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

class BridgeSessionImpl implements BridgeSession {
  private role: BridgeRole | null = null;
  private code: string | null = null;
  private rung: BridgeStatus['rung'] = 'offline';
  private connected = false;
  private lastPeerSeen: number | null = null;

  private mailbox: Mailbox | null = null;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;

  // S-02: Short Authentication String state.
  private sas: string | null = null;
  private sasVerified = false;

  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private reprobeTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private silenceTimer: ReturnType<typeof setInterval> | null = null;

  // WebRTC re-probe backoff state (F-08).
  private reprobeFailures = 0;
  private nextReprobeInMs = 0;
  private upgrading = false;

  private seenIds = new Set<string>();
  private outboundBuffer: BridgeEnvelope[] = [];

  private messageCbs: Array<(env: BridgeEnvelope) => void> = [];
  private statusCbs: Array<(s: BridgeStatus) => void> = [];

  // -- public API ---------------------------------------------------------

  async start(role: BridgeRole, code?: string): Promise<void> {
    this.stop();
    this.role = role;
    const effectiveCode = code ?? '';
    const { mailbox, code: finalCode } = await openMailboxForRole(role, effectiveCode);
    this.mailbox = mailbox;
    this.code = finalCode;
    this.rung = 'mailbox';
    this.emitStatus();

    this.schedulePoll(MAILBOX_POLL_MS);
    this.scheduleReprobe(REPROBE_MS);
    this.pingTimer = setInterval(() => this.sendPing(), PING_MS);
    this.silenceTimer = setInterval(() => this.checkSilence(), SILENCE_CHECK_MS);

    // Hub probes for WebRTC immediately; the display waits for the offer.
    if (role === 'hub') {
      this.startOffer();
    }
  }

  stop(): void {
    if (this.pollTimer !== null) clearTimeout(this.pollTimer);
    if (this.reprobeTimer !== null) clearTimeout(this.reprobeTimer);
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    if (this.silenceTimer !== null) clearInterval(this.silenceTimer);
    this.pollTimer = null;
    this.reprobeTimer = null;
    this.pingTimer = null;
    this.silenceTimer = null;
    this.reprobeFailures = 0;
    this.nextReprobeInMs = 0;
    this.upgrading = false;

    this.teardownPeer();

    // The mailbox Gist is intentionally left in place — it is the room's
    // reconnect memory and expires with the user's own Gist hygiene.
    this.mailbox = null;
    this.role = null;
    this.code = null;
    this.rung = 'offline';
    this.connected = false;
    this.lastPeerSeen = null;
    this.sas = null;
    this.sasVerified = false;
    this.seenIds.clear();
    this.outboundBuffer = [];
    this.emitStatus();
  }

  send(type: BridgeEnvelope['type'], payload: unknown): void {
    if (!this.role) return;
    const env: BridgeEnvelope = {
      id: createEnvelopeId(),
      from: this.role,
      ts: Date.now(),
      type,
      payload,
    };
    if (this.dc && this.dc.readyState === 'open') {
      this.sendOverDataChannel(env);
    } else if (this.connected && this.mailbox) {
      this.sendOverMailbox(env);
    } else {
      this.outboundBuffer.push(env);
      if (this.outboundBuffer.length > OUTBOUND_BUFFER_MAX) {
        this.outboundBuffer.shift();
      }
    }
  }

  onMessage(cb: (env: BridgeEnvelope) => void): void {
    this.messageCbs.push(cb);
  }

  onStatus(cb: (s: BridgeStatus) => void): void {
    this.statusCbs.push(cb);
  }

  getStatus(): BridgeStatus {
    return {
      role: this.role,
      rung: this.rung,
      connected: this.connected,
      code: this.code,
      lastPeerSeen: this.lastPeerSeen,
      upgrading: this.upgrading,
      nextReprobeInMs: this.nextReprobeInMs,
      sas: this.sas,
      sasVerified: this.sasVerified,
    };
  }

  /** S-02: user confirmed the 4-digit code matches on both devices. */
  confirmSas(): void {
    if (this.sas === null) return; // nothing to confirm
    this.sasVerified = true;
    this.emitStatus();
  }

  // -- status / presence ----------------------------------------------------

  private emitStatus(): void {
    const status = this.getStatus();
    for (const cb of this.statusCbs) cb(status);
  }

  private notePeerSeen(): void {
    this.lastPeerSeen = Date.now();
    if (!this.connected) {
      this.connected = true;
      this.flushOutbound();
    }
    this.emitStatus();
  }

  private checkSilence(): void {
    if (
      this.connected &&
      this.lastPeerSeen !== null &&
      Date.now() - this.lastPeerSeen > SILENCE_TIMEOUT_MS
    ) {
      this.connected = false;
      this.emitStatus();
    }
  }

  private sendPing(): void {
    if (!this.role || !this.connected) return;
    // Presence ping on whichever transport is currently hot. Mailbox pings
    // are cheap (~360 writes/hr) and keep the peer's lastPeerSeen fresh.
    this.send('ping', { ts: Date.now() });
  }

  // -- inbound ----------------------------------------------------------------

  private receive(env: BridgeEnvelope): void {
    if (!isValidEnvelope(env)) {
      console.warn('Dropped invalid bridge envelope', env);
      return;
    }
    if (!isValidBridgePayload(env)) {
      console.warn('Dropped invalid bridge payload', env);
      return;
    }
    if (!this.role || env.from === this.role) return; // ignore our own echoes
    if (this.seenIds.has(env.id)) return; // dedupe across both transports
    this.seenIds.add(env.id);
    if (this.seenIds.size > SEEN_IDS_MAX) {
      const first = this.seenIds.values().next().value;
      if (first !== undefined) this.seenIds.delete(first);
    }

    this.notePeerSeen();

    if (env.type === 'signal') {
      this.handleSignal(env.payload as SignalPayload).catch((error) =>
        console.warn('Bridge signal handling failed:', error)
      );
      return;
    }
    for (const cb of this.messageCbs) cb(env);
  }

  // -- mailbox polling --------------------------------------------------------

  private schedulePoll(intervalMs: number): void {
    if (this.pollTimer !== null) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => this.pollTick(intervalMs), intervalMs);
  }

  private async pollTick(intervalMs: number): Promise<void> {
    if (!this.mailbox) return;
    try {
      const envelopes = await this.mailbox.poll();
      for (const env of envelopes) this.receive(env);
    } catch (error) {
      // Transient network / rate-limit failures degrade silently; the
      // silence timer will flip connected=false if the peer stays dark.
      console.warn('Bridge mailbox poll failed:', error);
    }
    // Reschedule at the CURRENT rung's interval (may have changed mid-poll).
    let nextMs: number;
    if (this.rung === 'webrtc') {
      nextMs = KEEPALIVE_POLL_MS;
    } else if (intervalMs === KEEPALIVE_POLL_MS) {
      // Mid-demote from WebRTC: keep the keepalive cadence for one more tick.
      nextMs = intervalMs;
    } else {
      nextMs = MAILBOX_POLL_MS;
    }
    this.schedulePoll(nextMs);
  }

  private sendOverMailbox(env: BridgeEnvelope): void {
    if (!this.mailbox) return;
    this.mailbox
      .send(env)
      .catch((error) => console.warn('Bridge mailbox send failed:', error));
  }

  // -- WebRTC ladder ------------------------------------------------------------

  private static rtcAvailable(): boolean {
    return typeof RTCPeerConnection !== 'undefined';
  }

  /** Hub: (re)create the peer connection and send a fresh offer. */
  private startOffer(): void {
    if (!BridgeSessionImpl.rtcAvailable() || !this.role) return;
    this.teardownPeer();
    try {
      this.pc = new RTCPeerConnection(RTC_CONFIG);
      this.wirePeerConnection();
      this.wireDataChannel(this.pc.createDataChannel('ideario'));
      this.pc
        .createOffer()
        .then((offer) => this.pc!.setLocalDescription(offer))
        .then(() => this.waitForIceGatheringComplete(this.pc!))
        .then(() => {
          if (this.pc?.localDescription) {
            this.upgrading = true;
            this.emitStatus();
            this.sendSignal({ sdp: this.pc.localDescription.toJSON() });
          }
        })
        .catch((error) => console.warn('Bridge offer failed:', error));
    } catch (error) {
      console.warn('Bridge RTCPeerConnection unavailable:', error);
      this.teardownPeer(); // stay on the mailbox rung
    }
  }

  /** Silent re-probe: hub re-offers only while still on the mailbox rung. */
  private reprobe(): void {
    if (this.role === 'hub' && this.rung === 'mailbox') {
      // If the previous offer never upgraded to WebRTC, count it as a
      // failure and back off (F-08) before sending a fresh offer.
      if (this.upgrading) {
        this.noteReprobeFailure();
      } else {
        this.scheduleReprobe(REPROBE_MS);
      }
      this.startOffer();
    }
  }

  /**
   * Schedule the next WebRTC re-probe with exponential backoff (F-08).
   * After REPROBE_FAILURES_BEFORE_BACKOFF consecutive failed upgrades the
   * delay doubles each time, capped at REPROBE_BACKOFF_MAX_MS. A successful
   * upgrade (rung -> webrtc) resets the counter via resetReprobeBackoff().
   */
  private scheduleReprobe(delayMs: number): void {
    if (this.reprobeTimer !== null) clearTimeout(this.reprobeTimer);
    this.nextReprobeInMs = delayMs;
    this.reprobeTimer = setTimeout(() => {
      this.reprobeTimer = null;
      this.reprobe();
    }, delayMs);
    this.emitStatus();
  }

  /** Called when an upgrade attempt fails (offer sent, no answer/DC). */
  private noteReprobeFailure(): void {
    this.reprobeFailures += 1;
    const backoff =
      this.reprobeFailures > REPROBE_FAILURES_BEFORE_BACKOFF
        ? Math.min(REPROBE_MS * 2 ** (this.reprobeFailures - REPROBE_FAILURES_BEFORE_BACKOFF), REPROBE_BACKOFF_MAX_MS)
        : REPROBE_MS;
    this.scheduleReprobe(backoff);
  }

  /** Called when the DataChannel opens — the upgrade succeeded. */
  private resetReprobeBackoff(): void {
    this.reprobeFailures = 0;
    this.upgrading = false;
    if (this.reprobeTimer !== null) {
      clearTimeout(this.reprobeTimer);
      this.reprobeTimer = null;
    }
    this.nextReprobeInMs = 0;
    this.emitStatus();
  }

  private wirePeerConnection(): void {
    if (!this.pc) return;
    this.pc.ondatachannel = (event) => {
      this.wireDataChannel(event.channel);
    };
  }

  /** Wait for candidates to be embedded in SDP so each side sends one signal. */
  private waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const timeout = window.setTimeout(finish, 8_000);
      const onStateChange = () => {
        if (pc.iceGatheringState === 'complete') {
          finish();
        }
      };
      function finish(): void {
        window.clearTimeout(timeout);
        pc.removeEventListener('icegatheringstatechange', onStateChange);
        resolve();
      }
      pc.addEventListener('icegatheringstatechange', onStateChange);
    });
  }

  private wireDataChannel(channel: RTCDataChannel): void {
    this.dc = channel;
    channel.onopen = () => {
      this.rung = 'webrtc';
      this.schedulePoll(KEEPALIVE_POLL_MS); // mailbox drops to 30s keepalive
      this.resetReprobeBackoff();
      this.notePeerSeen();
      // S-02: recompute the SAS on every (re)open; reset verification.
      this.sasVerified = false;
      this.deriveSas().then((sas) => {
        this.sas = sas;
        this.emitStatus();
      }).catch(() => {
        this.sas = null;
        this.emitStatus();
      });
      this.emitStatus();
    };
    channel.onmessage = (event) => {
      try {
        const env = JSON.parse(event.data as string) as BridgeEnvelope;
        this.receive(env);
      } catch {
        // malformed frame — ignore
      }
    };
    const degrade = () => {
      if (this.rung === 'webrtc') {
        this.rung = 'mailbox';
        this.schedulePoll(MAILBOX_POLL_MS);
        this.emitStatus();
      }
      if (this.dc === channel) this.dc = null;
    };
    channel.onclose = degrade;
    channel.onerror = degrade;
  }

  private teardownPeer(): void {
    if (this.dc) {
      try {
        this.dc.close();
      } catch {
        // already closing
      }
      this.dc = null;
    }
    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        // already closed
      }
      this.pc = null;
    }
  }

  /**
   * S-02: derive a 4-digit Short Authentication String from BOTH SDP
   * fingerprints, sorted canonically, so both devices compute the SAME code.
   *
   * The audit's snippet used getRemoteCertificates() only — but the hub's
   * "remote cert" is the display's cert and vice-versa, so the two devices
   * would compute DIFFERENT codes. Combining both fingerprints in sorted
   * order fixes that: honest peers share the same set, a MITM sees different
   * sets per leg and the codes diverge.
   *
   * Returns null when it cannot be derived (no fingerprints, or crypto.subtle
   * unavailable in a non-secure context — the expected degradation on the
   * head unit's WebView). A null SAS means the link is UNVERIFIED and key
   * sync must be blocked.
   */
  private async deriveSas(): Promise<string | null> {
    const localSdp = this.pc?.localDescription?.sdp ?? '';
    const remoteSdp = this.pc?.remoteDescription?.sdp ?? '';
    const fp = (sdp: string): string | null => {
      const m = sdp.match(/a=fingerprint:(?:sha-256|sha-1)\s+([0-9A-Fa-f:]+)/);
      return m ? m[1].toUpperCase() : null;
    };
    const a = fp(localSdp);
    const b = fp(remoteSdp);
    if (!a || !b) return null;
    const [x, y] = [a, b].sort(); // canonical order -> same on both sides
    const bytes = new TextEncoder().encode(`${x}|${y}`);
    if (typeof crypto === 'undefined' || !crypto.subtle) return null;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return String(((digest[0] << 8) | digest[1]) % 10000).padStart(4, '0');
  }

  private sendSignal(payload: SignalPayload): void {
    // Signalling always rides the mailbox — by definition the DataChannel
    // is not up yet (or has dropped) while we signal.
    if (!this.role || !this.mailbox) return;
    const env: BridgeEnvelope = {
      id: createEnvelopeId(),
      from: this.role,
      ts: Date.now(),
      type: 'signal',
      payload,
    };
    this.sendOverMailbox(env);
  }

  private async handleSignal(payload: SignalPayload): Promise<void> {
    if (!payload || !BridgeSessionImpl.rtcAvailable()) return;

    if (payload.sdp) {
      if (payload.sdp.type === 'offer' && this.role === 'display') {
        this.teardownPeer();
        this.pc = new RTCPeerConnection(RTC_CONFIG);
        this.wirePeerConnection();
        await this.pc.setRemoteDescription(payload.sdp);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await this.waitForIceGatheringComplete(this.pc);
        if (this.pc.localDescription) {
          this.sendSignal({ sdp: this.pc.localDescription.toJSON() });
        }
      } else if (payload.sdp.type === 'answer' && this.role === 'hub' && this.pc) {
        await this.pc.setRemoteDescription(payload.sdp);
      }
    }

    if ('candidate' in payload && this.pc) {
      try {
        await this.pc.addIceCandidate(payload.candidate ?? null);
      } catch (error) {
        console.warn('Bridge addIceCandidate failed:', error);
      }
    }
  }

  private sendOverDataChannel(env: BridgeEnvelope): void {
    if (!this.dc || this.dc.readyState !== 'open') return;
    try {
      this.dc.send(JSON.stringify(env));
    } catch (error) {
      console.warn('Bridge DataChannel send failed:', error);
    }
  }

  private flushOutbound(): void {
    const pending = this.outboundBuffer;
    this.outboundBuffer = [];
    for (const env of pending) {
      if (this.dc && this.dc.readyState === 'open') {
        this.sendOverDataChannel(env);
      } else {
        this.sendOverMailbox(env);
      }
    }
  }
}

let singleton: BridgeSession | null = null;

export function getBridgeSession(): BridgeSession {
  if (!singleton) {
    singleton = new BridgeSessionImpl();
  }
  return singleton;
}

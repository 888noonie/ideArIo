/**
 * Bridge session: the probe-and-degrade transport ladder.
 *
 *   WebRTC DataChannel  -> rung 'webrtc'  (instant, mailbox drops to 30s keepalive)
 *   Gist mailbox        -> rung 'mailbox' (2.5s poll)
 *   stopped / no token  -> rung 'offline'
 *
 * The hub creates the mailbox and the WebRTC offer (STUN
 * stun.l.google.com:19302); the display answers. SDP + trickle ICE ride
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
import { openMailbox, type Mailbox } from './mailbox';

const MAILBOX_POLL_MS = 2_500;
const KEEPALIVE_POLL_MS = 30_000;
const REPROBE_MS = 30_000;
const PING_MS = 10_000;
const SILENCE_CHECK_MS = 5_000;
const SILENCE_TIMEOUT_MS = 20_000;
const OUTBOUND_BUFFER_MAX = 20;
const SEEN_IDS_MAX = 500;

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export interface BridgeSession {
  start(role: BridgeRole, code: string): Promise<void>;
  stop(): void;
  send(type: BridgeEnvelope['type'], payload: unknown): void;
  onMessage(cb: (env: BridgeEnvelope) => void): void;
  onStatus(cb: (s: BridgeStatus) => void): void;
  getStatus(): BridgeStatus;
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

  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private reprobeTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private silenceTimer: ReturnType<typeof setInterval> | null = null;

  private seenIds = new Set<string>();
  private outboundBuffer: BridgeEnvelope[] = [];

  private messageCbs: Array<(env: BridgeEnvelope) => void> = [];
  private statusCbs: Array<(s: BridgeStatus) => void> = [];

  // -- public API ---------------------------------------------------------

  async start(role: BridgeRole, code: string): Promise<void> {
    this.stop();
    this.role = role;
    this.code = code;
    this.mailbox = await openMailbox(code); // throws descriptive Error when no token
    this.rung = 'mailbox';
    this.emitStatus();

    this.schedulePoll(MAILBOX_POLL_MS);
    this.reprobeTimer = setInterval(() => this.reprobe(), REPROBE_MS);
    this.pingTimer = setInterval(() => this.sendPing(), PING_MS);
    this.silenceTimer = setInterval(() => this.checkSilence(), SILENCE_CHECK_MS);

    // Hub probes for WebRTC immediately; the display waits for the offer.
    if (role === 'hub') {
      this.startOffer();
    }
  }

  stop(): void {
    if (this.pollTimer !== null) clearTimeout(this.pollTimer);
    if (this.reprobeTimer !== null) clearInterval(this.reprobeTimer);
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    if (this.silenceTimer !== null) clearInterval(this.silenceTimer);
    this.pollTimer = null;
    this.reprobeTimer = null;
    this.pingTimer = null;
    this.silenceTimer = null;

    this.teardownPeer();

    // The mailbox Gist is intentionally left in place — it is the room's
    // reconnect memory and expires with the user's own Gist hygiene.
    this.mailbox = null;
    this.role = null;
    this.code = null;
    this.rung = 'offline';
    this.connected = false;
    this.lastPeerSeen = null;
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
    };
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
    this.schedulePoll(
      this.rung === 'webrtc' ? KEEPALIVE_POLL_MS : intervalMs === KEEPALIVE_POLL_MS ? intervalMs : MAILBOX_POLL_MS
    );
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
        .then(() => {
          if (this.pc?.localDescription) {
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
      this.startOffer();
    }
  }

  private wirePeerConnection(): void {
    if (!this.pc) return;
    this.pc.onicecandidate = (event) => {
      this.sendSignal({ candidate: event.candidate ? event.candidate.toJSON() : null });
    };
    this.pc.ondatachannel = (event) => {
      this.wireDataChannel(event.channel);
    };
  }

  private wireDataChannel(channel: RTCDataChannel): void {
    this.dc = channel;
    channel.onopen = () => {
      this.rung = 'webrtc';
      this.schedulePoll(KEEPALIVE_POLL_MS); // mailbox drops to 30s keepalive
      this.notePeerSeen();
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

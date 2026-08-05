/**
 * Bridge protocol types shared by the mailbox transport and the
 * session ladder. FROZEN — bridge-ui consumes these exactly.
 */

export type BridgeRole = 'hub' | 'display';
export type BridgeRung = 'webrtc' | 'mailbox' | 'offline';
export type BridgeEnvelopeType = 'chat-input' | 'entries' | 'signal' | 'ping' | 'state';

export interface BridgeEnvelope {
  id: string;
  from: BridgeRole;
  ts: number;
  type: BridgeEnvelopeType;
  payload: unknown;
}

export interface BridgeStatus {
  role: BridgeRole | null;
  rung: BridgeRung;
  connected: boolean;
  code: string | null;
  lastPeerSeen: number | null;
  /** True while the hub is actively trying to upgrade mailbox -> WebRTC. */
  upgrading?: boolean;
  /** Milliseconds until the next WebRTC re-probe (0 when not scheduled). */
  nextReprobeInMs?: number;
}

/** WebRTC signalling payload carried inside 'signal' envelopes. */
export interface SignalPayload {
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit | null;
}

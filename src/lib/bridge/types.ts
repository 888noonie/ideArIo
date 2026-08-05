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
  /**
   * S-02: Short Authentication String — 4-digit code derived from both SDP
   * fingerprints. null when it cannot be derived (e.g. crypto.subtle
   * unavailable in a non-secure context, or no fingerprints). Optional
   * addition to the frozen BridgeStatus.
   */
  sas?: string | null;
  /** S-02: true once the user confirms the 4-digit code matches on both devices. */
  sasVerified?: boolean;
}

/** WebRTC signalling payload carried inside 'signal' envelopes. */
export interface SignalPayload {
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit | null;
}

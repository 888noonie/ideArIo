# ideArIo Bridge — architecture & honest limits

The Bridge pairs two browsers (phone + car display, phone + laptop, …)
into one ideArIo room. One side is the **hub** (owns the agents and the
LLM keys), the other is the **display** (sends input, renders entries).
Everything runs in plain browser APIs — no new dependencies, no native
code.

## What ships

| Piece | Where | What it does |
|---|---|---|
| Pairing | `src/lib/bridge/session.ts` | 6-digit code; hub creates the room, display joins it |
| Mailbox transport | `src/lib/bridge/mailbox.ts` | One private Gist per code (`ideario-bridge-<code>`), one file `messages.json` = `{ envelopes }` (last 100 kept) |
| Transport ladder | `src/lib/bridge/session.ts` | WebRTC DataChannel → Gist mailbox → offline, probe-and-degrade with silent 30s re-probe |
| Reflex lane | `src/lib/reflex.ts` | Pattern-matched local commands answered before any LLM round-trip (<250ms) |
| Trust spine | `src/lib/trust.ts` | `suggest / co_pilot / autonomous` + urgency cap + sliding 60s rate limiter |
| Urgency signals | `src/lib/urgency.ts` | whisper/tap/alert as haptics + quiet WebAudio blips, never visual |
| Crew audio | `src/lib/crew-audio.ts` | Opt-in speech synthesis + MediaSession anchor ("Ideario Crew") |
| Link queue | `src/lib/link-queue.ts` | Voice-initiated "queue/open <url>", visual confirmation later, cap 50 |

## Token resolution order

The bridge mailbox (and "save this" Gist writes) resolve the GitHub
token in this order:

1. `localStorage['ideario-github-token']` (Settings → Gist token)
2. `import.meta.env.VITE_GITHUB_TOKEN` (build-time env)

If neither exists, opening a mailbox throws:
`"Bridge needs a GitHub token — add one in Settings (Gist token)."`

All Gist calls use `Authorization: Bearer <token>` and
`Accept: application/vnd.github+json`.

## The transport ladder

```
probe RTCPeerConnection
  ├─ available ── hub: createOffer (STUN stun.l.google.com:19302)
  │                SDP + trickle ICE ride 'signal' envelopes via mailbox
  │                display answers; DataChannel 'open'
  │                  └─ rung = webrtc   (mailbox drops to 30s keepalive poll)
  │                DC close/error
  │                  └─ rung = mailbox  (2.5s poll resumes)
  └─ missing ──── rung = mailbox        (2.5s poll, no WebRTC attempted)

no peer traffic for 20s ── connected = false (either rung)
every 30s ── silent re-probe: hub re-offers ONLY while rung = mailbox
stop() ── closes DC + PC, clears all timers, resets to offline
           (the mailbox Gist is left in place as reconnect memory)
```

Inbound envelopes are deduped by id across both transports. Outbound
envelope are buffered (max 20) while disconnected and flushed on
connect. `lastPeerSeen` updates on ANY inbound envelope or DataChannel
message.

## Latency expectations (honest numbers)

| Rung | Path | Typical one-way latency |
|---|---|---|
| `webrtc` | DataChannel, P2P after STUN | 20–80 ms on LAN/hotspot, 50–200 ms across NATs |
| `mailbox` | Gist write + 2.5s poll tick | 1.3–5 s (poll interval dominates; plus GitHub API ~150–400 ms per call) |
| `offline` | — | nothing flows; outbound buffered (max 20) |

The mailbox is a **degraded** rung, not a realtime one. Voice-initiated
actions that need instant feedback are handled by the reflex lane
locally; only chat entries and chat input cross the bridge.

## Gist rate-limit math

GitHub's REST API allows **5,000 authenticated requests/hour** per token.

- Mailbox rung: poll every 2.5s ≈ **1,440 reads/hr per side**,
  plus ~360 presence-ping writes/hr ≈ **~1,800 req/hr per side**.
- WebRTC rung: keepalive poll every 30s = 120 reads/hr per side —
  negligible.
- Worst case (both sides on mailbox, same token): ~3,600 req/hr total,
  still inside the 5,000/hr limit. Separate tokens: ~1,800/hr each.
- Envelope file is capped at the last 100 envelopes, so reads stay
  small and writes are one file each.

## Trust, urgency, reflex

- **Trust** (`suggest/co_pilot/autonomous`) governs autonomy;
  **urgency** (`whisper/tap/alert`) governs interruption intensity.
  They are independent axes; a manual override always wins.
- The rate limiter is a sliding 60s window in
  `localStorage['ideario-suggest-log']` (array of timestamps, pruned on
  every call); default cap is 1 unprompted suggestion/minute — the crew
  never speaks unaddressed beyond that.
- Urgency signals are haptic (`navigator.vibrate`, guarded) + a single
  lazily-created AudioContext (created on the first user-gesture-driven
  signal, satisfying autoplay policies). `ideario-muted` silences all.
- The reflex lane matches trimmed lowercase input (wake word already
  stripped): "save this [as <tag>]", "tag this [as <tag>]",
  "open/queue <url>", "i'm open / i'm focused" (trust),
  "stop talking / quiet / shush". It returns its confirmation string
  immediately — the gist save behind "save this" continues in the
  background and is never awaited in the response path.

## Phase 3 — explicitly NOT in this codebase

The Crew dreamed past the browser sandbox. The following require a
**native companion app** (e.g. an Android APK bridging to the car) and
are documented here only — there is no code for them in this repo:

- **Cross-app media control** — pausing Spotify/Maps audio ducking from
  the web page is not possible; browsers expose only MediaSession for
  the page's own audio.
- **Climate / navigation intents** — fan speed, cabin temperature,
  destination hand-off require Android Automotive / vehicle APIs.
- **AA notification feed** — reading or overriding other apps'
  notifications needs a NotificationListenerService, a native-only API.
- **Cabin telemetry** — gaze, steering, seat, and biometric sensors are
  vehicle-bus data, unreachable from a browser.

A future native companion would pair over the same bridge protocol
(envelopes + mailbox/WebRTC ladder) and expose these as new envelope
types — the protocol's `payload: unknown` already leaves room for that.

# B7 Implementation Plan — Display pairing without a local Gist token

**For:** Kimi (implementer)  
**Auditor:** Terra (GPT-Frontier)  
**Source audit:** Terra review of initial B7 relay proposal, 2026-08-06  
**Entry state:** `origin/main` after B4–B6 (all S1–S8 + UX items shipped). Gates green.  
**Exit criteria:** F-26 implemented, gates green, commit per convention, Frontier audit before push.

## Finding ID

Batch 7 (F-26): **Display can pair without a local GitHub token.**

## Problem statement

`src/lib/bridge/mailbox.ts` requires `ideario-github-token` in localStorage for **both** hub and display. That forces the car display to have the Gist token before pairing, defeating the point of the bridge: the phone should be able to create the room and the display should join it with only the 6-digit code.

## Goal

The display can enter a 6-digit code and complete WebRTC pairing **without any local GitHub token**. The Gist token lives only server-side in Vercel. Credentials still transfer phone → display over the verified WebRTC DataChannel, never through the mailbox.

## Non-goals

- No QR code yet (deferred to future batch).
- No new provider adapters (Gemini/Groq/OfoxAI) — separate batch after this lands.
- No changes to `BridgeEnvelope`, `ChatEntry`, or the settings-sync payload shape.
- No changes to Gist-based idea saving (`gist-client.ts`, `reflex-helpers.ts`) — those still use a local token when available.

## Terra-audit corrections folded in

The initial plan had three critical flaws. This revision fixes them:

1. **Both roles must use the same transport.** A split where hub uses direct Gist and display uses relay cannot converge on the same mailbox. The relay becomes the default transport for **both** roles in relay mode.
2. **The relay must own the room.** Vercel’s server token cannot read a private Gist created by the phone’s token. The relay creates and operates the mailbox using its own server-side token.
3. **Honest limits of a 6-digit code.** A short human-typed code is a pairing handle, not a cryptographic secret. SAS remains the load-bearing security control: keys only sync after both sides confirm the same 4 digits. The relay adds rate limits and single-display locking to reduce opportunistic abuse.

## Architecture

### Two pairing modes

| Mode | When used | Token needed on phone | Token needed on display |
|---|---|---|---|
| **Ario Relay (default)** | Always unless legacy direct mode is enabled | None for pairing | None |
| **Direct Gist (legacy)** | Explicit opt-in when both devices already have `ideario-github-token` | Yes | Yes |

For this batch, implement **Relay mode as the default**. Keep the direct-Gist code path intact so existing localStorage tokens are not ignored, but expose it only through a low-level toggle or automatic fallback when the relay endpoint is unreachable and both sides have tokens.

### Relay mode flow

1. **Phone (hub)** taps “Generate code.”
   - POST `/api/bridge-relay?action=create` → returns `{ code: "123456", hubSecret: "..." }`.
   - Relay creates a private Gist `ideario-bridge-<code>` using the server token.
2. **Display** enters the 6-digit code and taps “Join.”
   - POST `/api/bridge-relay?action=join` with `{ code }` → returns `{ displaySecret: "..." }`.
   - Relay locks the room to this display session (one display per room).
3. **Signaling**:
   - Hub polls/writes via `/api/bridge-relay?action=room&code=...&secret=<hubSecret>`.
   - Display polls/writes via `/api/bridge-relay?action=room&code=...&secret=<displaySecret>`.
4. **WebRTC DataChannel opens** → rung = `webrtc`.
5. **SAS appears on both devices** → users confirm 4-digit match.
6. **Settings sync** over verified DataChannel → provider keys land on display.

### Server-side storage

- One private GitHub Gist per room, created by Vercel using `BRIDGE_GITHUB_TOKEN`.
- `messages.json` contains `{ envelopes: BridgeEnvelope[], expires_at?: number }`.
   `room.json` stores only SHA-256 hashes of hub/display capabilities and expiry,
   allowing serverless instances to verify requests without plaintext secrets.
- Same last-write-wins, envelope-dedupe, and expiry semantics as today’s `mailbox.ts`.
- Room TTL: 24 hours, refreshed during active use.
- Server enforces max envelopes (100), max body size, and valid envelope schema.

## Server API (`api/bridge-relay.ts`)

New Vercel serverless function. Modeled on `api/nim-proxy.ts` for consistency.

### Endpoints

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/api/bridge-relay?action=create` | Origin gate + rate limit | — | `{ code, hubSecret, expiresAt }` |
| POST | `/api/bridge-relay?action=join` | Origin gate + rate limit | `{ code }` | `{ displaySecret, expiresAt }` or error |
| GET | `/api/bridge-relay?action=room` | `code` + `secret` query params | — | `{ envelopes, expires_at }` |
| POST | `/api/bridge-relay?action=room` | `code` + `secret` query params | `{ envelopes, expires_at? }` | `{ ok: true }` or error |

### Security controls

- **Origin gate:** same implementation as `api/nim-proxy.ts` — `VERCEL_URL` auto-allow + `ALLOWED_ORIGINS` allowlist. Missing/cross-origin → 403.
- **Rate limit:** same in-memory sliding window as `api/nim-proxy.ts` (60 s window, 30 req cap, 5,000 IP map bound). Best-effort because serverless instances are ephemeral.
- **Room limits:**
  - Max 1,000 active relay rooms (LRU eviction of oldest inactive room).
  - One display per room; second join returns 409 until the room expires or is recreated.
  - Max request body 64 KB.
- **Envelope validation:** use `isValidEnvelope` from `src/lib/bridge/validate.ts` before storing.
- **Expiry:** expired room returns `410 Gone` with `{ expired: true }` so the UI can show the existing honest message.

### Server token resolution

```ts
const GITHUB_TOKEN = process.env.BRIDGE_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? '';
```

If neither is set, the function returns 500 with `{ error: 'Relay not configured' }`.

## Client transport (`src/lib/bridge/relay-mailbox.ts`)

New `Mailbox` implementation that talks to `/api/bridge-relay`.

```ts
export interface RelayCredentials {
  code: string;
  hubSecret?: string;
  displaySecret?: string;
}

export async function openRelayMailbox(creds: RelayCredentials): Promise<Mailbox>;
```

Behavior:
- `send(env)`: GET current envelopes, merge, dedupe by id, POST full file.
- `poll()`: GET current envelopes, return only those newer than local high-water mark, refresh expiry in last 25% of TTL.
- Errors surface as descriptive `Error` messages matching existing `mailbox.ts` copy.

## Session changes (`src/lib/bridge/session.ts`)

Introduce a `MailboxFactory` selection helper:

```ts
async function openMailboxForRole(role: BridgeRole, code: string): Promise<Mailbox>
```

Logic:
1. If `VITE_BRIDGE_RELAY_URL` is non-empty (default `/api/bridge-relay`), use relay mode.
   - `hub`: call `/api/bridge-relay?action=create`, store returned credentials, start signaling.
   - `display`: call `/api/bridge-relay?action=join` with the typed code, store credentials, start signaling.
2. If relay URL is empty **and** a local Gist token exists, fall back to direct-Gist `openMailbox(code)`.
3. If neither, throw honest error: “Pairing needs either the Ario relay or a GitHub token in Settings.”

For this batch, set the default relay URL to `/api/bridge-relay` so relay mode is active. The direct-Gist path remains as a documented escape hatch.

## Dev mock for `npm run dev`

Add a dev-only middleware route `/api/bridge-relay/*` in `vite.config.ts` that stores rooms in memory. Mirrors the existing NIM mock pattern (`src/lib/nim-mock.ts`).

- No GitHub token needed in dev.
- Rooms expire after 24 h or on server restart.
- Same endpoints and envelope semantics as the Vercel function.

## UI / copy changes

### `src/components/BridgeTab.tsx`

- Hub flow: “Generate code” now calls relay create. Show the 6-digit code and a hint: “Enter this code on the display.”
- Display flow: unchanged input UX. If pairing succeeds via relay while no local token exists, show honest status: “Connected via Ario relay — credentials will sync after you confirm the code.”
- Error surfaces: reuse existing `startError` alert.

### `src/components/SettingsPanel.tsx`

- Update Gist-token hint: clarify that the token is only needed for **saving ideas to Gist**; bridge pairing no longer requires it.

## Env / config changes

### `.env.example`

```
# Server-side GitHub token for the bridge relay (display-side pairing).
# Never prefixed with VITE_ — must not reach the client bundle.
BRIDGE_GITHUB_TOKEN=

# Comma-separated list of allowed origins for /api/* endpoints.
ALLOWED_ORIGINS=
```

### `vercel.json`

Add function entry for `api/bridge-relay.ts` with `maxDuration: 10`. Keep the existing `/api/(.*)` rewrite and CSP headers.

### `vite.config.ts`

- Import dev relay middleware from a new `src/lib/bridge/relay-mock.ts` (dev-only, not bundled).
- Mount it at `/api/bridge-relay` before the existing NIM proxy middleware.

## Files touched

- New: `api/bridge-relay.ts`
- New: `src/lib/bridge/relay-mailbox.ts`
- New: `src/lib/bridge/relay-mock.ts` (dev-only)
- Edit: `src/lib/bridge/session.ts`
- Edit: `src/lib/bridge/mailbox.ts` (minor: keep exported `Mailbox` type, maybe share dedupe helper)
- Edit: `src/lib/bridge/validate.ts` (ensure server can import it; may already work)
- Edit: `vite.config.ts`
- Edit: `vercel.json`
- Edit: `.env.example`
- Edit: `src/components/BridgeTab.tsx`
- Edit: `src/components/SettingsPanel.tsx`
- Edit: `README.md` (one-line stale VITE_GITHUB_TOKEN fix carried from B4 audit note)

## Verification

- `npx tsc -b` — 0 errors.
- `npm run lint` — 0 errors (2 tolerated App.tsx warnings remain).
- `npm run build` — green.
- Bundle scan: no `BRIDGE_GITHUB_TOKEN` or Gist token literal in `dist/`.
- Manual/dev test:
  1. Clear `ideario-github-token` from both phone and display browsers.
  2. Phone hub taps “Generate code.”
  3. Display enters code and joins.
  4. Both reach `mailbox` rung, then `webrtc` rung.
  5. Same 4-digit SAS appears on both.
  6. Confirm on both; “Sync settings” on hub writes provider keys to display localStorage.
  7. Inspect network: display never calls `api.github.com`.
  8. Inspect Gist via GitHub UI: created by the Vercel bot account, envelopes only contain `signal`/`ping`, never `settings-sync`.

## Security / invariant checklist

- [ ] `BRIDGE_GITHUB_TOKEN` is never read client-side and does not appear in the bundle.
- [ ] Settings-sync envelopes still flow only over WebRTC after SAS confirmation.
- [ ] Relay validates every envelope with `isValidEnvelope` before storage.
- [ ] Origin gate + rate limit active on all relay endpoints.
- [ ] Room locked to one display; second join rejected.
- [ ] Expired rooms return 410 with honest copy.
- [ ] `BridgeEnvelope` and `ChatEntry` shapes unchanged.

## Commit plan

One commit: `Batch 7 (F-26): server-owned bridge relay lets display pair without a local Gist token`.

Body:
- What changed: default bridge transport now uses `/api/bridge-relay`, which owns the mailbox Gist server-side.
- Why: direct Gist required a token on the display, defeating credential transfer.
- Honest limits: 6-digit code is a pairing handle, not a secret; SAS still gates key sync.
- Direct-Gist path remains as legacy fallback when relay is disabled and both sides have tokens.

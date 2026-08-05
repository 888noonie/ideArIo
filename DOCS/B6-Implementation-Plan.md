# Batch 6 Implementation Plan — for DeepSeek Flash V4

**Author:** GLM 5.2 (chief auditor)
**Date:** 2026-08-05
**Status:** Ready for Flash to implement after compact
**Scope:** In-car calm polish (pre-release): U-01, U-05, U-06, S-08, S-06 (note-only)

**Read this entire plan before touching code.** Then implement one finding at
a time, run the gates after each, commit per-finding, and push to `origin/main`.
GLM will audit after you push.

---

## Context you need

Batch 5 is done and audited (see `DOCS/B5-Audit-Report.md`). Gates are green.
The bridge is SAS-verified (S-02), envelopes are validated (S-05), attached
files are wrapped (S-07), trust escalation requires confirm (U-02), the wake
word is hardened (U-04), and speech settings persist (U-07).

Batch 6 is the **calm-polish / pre-release** batch. The theme is: **remove
every "eyes on screen for 10+ seconds" interaction from the driving state,
and give the user honest off-ramps.** None of these are security-critical —
they're the last UX hardening before Richard road-tests in the Tucson.

---

## Frozen contracts (re-read before each finding)

- **`BridgeEnvelope`** / **`BridgeStatus`** / **`ChatEntry`** / **`SyncedSettings`**
  — FROZEN. Do not add, rename, or reorder fields.
- **No native popups** — every new confirmation must be a custom component,
  never `<select>` / `<datalist>` / `<input type=color>` / `confirm()`. Use
  `ListSelect` (`src/components/ui/ListSelect.tsx`) for any list picker.
- **Viewport lock** — `--app-h` is set once on load and NOT updated on
  resize/orientation. Do not add resize listeners.
- **Honesty** — every blocked/degraded path surfaces Ario's own copy, never a
  raw platform message.
- **ESM** — `"type": "module"`. Never `require()`.

---

## Gates (must stay green after every commit)

- `npx tsc -b` — 0 errors
- `npm run lint` — 0 errors (the 2 pre-existing `App.tsx` `exhaustive-deps`
  warnings are tolerated; do not "fix" them)
- `npm run build` — green

---

## U-01 — Parked gate for high-distraction interactions

**Files:** new `src/lib/drive-state.ts`, `BridgeTab.tsx`, `SettingsPanel.tsx`,
`ChatPanel.tsx`.

**Why:** Pairing code entry, API key editing, and file attachment all require
sustained visual attention. While driving, these must be unreachable — not
merely discouraged.

### Design

1. New `src/lib/drive-state.ts`:
```ts
const PARKED_KEY = 'ideario-parked';
export function isParked(): boolean {
  try { return localStorage.getItem(PARKED_KEY) === 'true'; } catch { return false; }
}
export function setParked(p: boolean): void {
  try { localStorage.setItem(PARKED_KEY, String(p)); } catch {}
}
```
Default: `false` (driving). The user explicitly toggles to "I'm parked" when
parked. This is intentionally manual — we do NOT auto-detect motion (that
needs sensor permissions and is unreliable in a WebView).

2. Add a large (≥72px tall), always-visible toggle in `BridgeTab.tsx` at the
   TOP of the tab, above the role picker. Two states:
   - **Driving** (default, amber): "🚗 Driving — high-distraction actions locked"
   - **Parked** (turquoise): "🅿️ Parked — all actions available"
   Use a single big button (min-h-[72px]) that flips the state. Persist via
   `setParked`. Emit a window event `ideario-drive-state-changed` so other
   components can react without prop-drilling.

3. Gate these interactions while driving (check `isParked()` before rendering
   the interactive form; show honest copy otherwise):
   - **`BridgeTab.tsx`** pairing code input + Join button → show
     "Park to pair a new device." (the live status card stays visible — the
     user can still see the connection state).
   - **`SettingsPanel.tsx`** API key fields → show a read-only summary
     "2 keys stored — park to edit" (count the non-empty
     `ideario-key-*` values; do not reveal the key values themselves).
   - **`ChatPanel.tsx`** the `+` file picker button → disabled with a
     title "Park to attach a file."
   - **`ChatPanel.tsx`** "Tap to expand" on long agent bubbles in paired
     mode → if you find such an affordance, replace it with: crew audio reads
     the first sentence and says "full reply is in the chat." (If no such
     expand affordance exists today, skip this sub-item — do not invent one.)

4. The toggle itself is always available (even while driving) — the user must
   be able to flip back to "parked" without parking. This is intentional: the
   gate is about attention, not about forcing a literal parking maneuver.

### Verify
- Toggle to "Driving" → pairing input, key fields, and file picker are
  locked with honest copy.
- Toggle to "Parked" → all actions available.
- Reload → state persists.
- The toggle is ≥72px and visible without scrolling in the Bridge tab.

---

## U-05 — First-run consent moment

**Files:** new `src/components/FirstRunConsent.tsx`, `App.tsx`.

**Why:** A first launch should not surprise the user with an OS permission
dialog while driving. A 3-line parked-only primer sets expectations.

### Design

1. New `src/components/FirstRunConsent.tsx` — a custom modal (never a native
   popup). Three lines of copy:
   - "Ario listens only after you say 'Hey Ario.'"
   - "Your keys and ideas stay in this browser, sent only to providers you choose."
   - "Tap the mic when you're ready to talk."
   Plus one honesty line: "Speech recognition uses your browser's built-in
   service (on Chrome, Google's). Everything else stays local unless you send it."
   One button: "Got it" (min-h-14, full-width, turquoise).

2. Gate on **both** first-run AND parked state. If the user launches for the
   first time while "driving" (the default), show the primer but disable the
   "Got it" button until they toggle to parked — OR, simpler and calmer:
   show the primer immediately on first run regardless of drive state (it's
   read-only text, not a high-distraction interaction), but do NOT trigger
   any OS permission prompt from it. The mic permission is only requested
   when the user first taps the mic in the Voice Chat tab, which is already
   gesture-gated.

   **Decision: show on first run regardless of drive state.** The primer is
   text, not an interaction. The permission prompt stays gesture-gated.

3. Persist a `ideario-first-run-done` flag in localStorage. On "Got it", set
   it and never show again.

4. Render in `App.tsx` as an overlay (fixed, high z-index) when the flag is
   absent. Use the existing custom-modal pattern from
   `SettingsSyncPrompt.tsx` / `NodeDetail.tsx` (aria-modal, custom dismiss).

### Verify
- First launch → primer appears.
- "Got it" → primer dismisses, does not reappear on reload.
- No OS permission prompt fires from the primer itself.

---

## U-06 — Status-bar rung dot

**Files:** `src/components/StatusBar.tsx`, `App.tsx`.

**Why:** Paired-mode users shouldn't have to leave chat to check "is the car
still connected?"

### Design

1. Pass the bridge rung (`BridgeStatus['rung']`) from `App.tsx` into
   `StatusBar`. `App.tsx` already has the bridge session via
   `getBridgeSession()`; subscribe to status there (or lift the existing
   `BridgeTab` subscription — but a separate lightweight subscription in App
   is cleaner, since `BridgeTab` may not be mounted).

2. In `StatusBar.tsx`, render a single small dot (8px) with a tooltip/title:
   - `webrtc` → turquoise (`bg-ario-turquoise`)
   - `mailbox` → amber (`bg-amber-400`)
   - `offline` → hidden (no dot — don't clutter the bar when bridge is off)
   Reuse the `RUNG_META` colors from `BridgeTab.tsx` (extract them to a shared
   constant or just re-declare inline — they're 3 lines).

3. The dot is informational only — no click handler. Keep it small and
   peripheral; it must not compete with primary content for attention
   (glanceable invariant).

### Verify
- Start bridge as hub → dot appears turquoise after WebRTC upgrade, amber
  while on mailbox.
- Stop bridge → dot disappears.
- Dot is ≤8px and does not shift layout when it appears/disappears.

---

## S-08 — "Wipe keys on this device"

**Files:** `src/components/SettingsPanel.tsx`, `src/lib/providers/index.ts`.

**Why:** Keys sit in plaintext in localStorage. On a shared car head unit, the
user needs a clean off-ramp.

### Design

1. Add a `wipeKeysOnDevice()` function in `src/lib/providers/index.ts`:
   - Remove every `ideario-key-*` from localStorage.
   - Remove `ideario-github-token`.
   - Do NOT remove `ideario-agents`, `ideario-trust`, `ideario-chat-log`,
     `ideario-speech-settings`, or `ideario-parked` — those are preferences
     and history, not secrets. Wipe is about secrets only.
   - Emit a window event `ideario-keys-wiped` so SettingsPanel can refresh
     its key-field display.

2. In `SettingsPanel.tsx`, add a "Wipe keys on this device" button at the
   BOTTOM of the panel, below the existing fields. Big target (min-h-14),
   red/destructive styling (`bg-ario-red/10 border-ario-red/40`).

3. **Confirm-twice** (reuse the agent-reset confirm pattern from
   `AgentManager.tsx` if it exists; otherwise a custom two-tap flow):
   - First tap → button label changes to "Tap again to confirm wipe" and
     arms a 5-second window.
   - Second tap within 5s → calls `wipeKeysOnDevice()`, shows a system
     notice "Keys wiped from this device."
   - Timeout or navigation away → disarms.

4. **Gate on parked** (U-01): while driving, the wipe button is disabled with
   "Park to wipe keys." (Wiping keys while driving would leave the user
   unable to re-enter them safely.)

5. Never use `confirm()` — the two-tap custom flow is the confirmation.

### Verify
- Add keys → wipe → keys gone from localStorage, fields clear.
- Preferences/history survive the wipe.
- Two-tap flow: first tap alone does nothing.
- While driving: button disabled.

---

## S-06 — Pairing-code entropy (NOTE ONLY, no code change)

**No implementation.** This is a documented decision: SAS (S-02) supersedes
the need to raise the 6-digit pairing code entropy. A forged peer is caught
by the SAS code mismatch regardless of how guessable the pairing code is,
and F-01's 24h expiry shrinks the window. If Richard later wants
belt-and-braces, raise the code to 8+ digits in `BridgeTab.randomCode()` and
the display's `joinCode` validation regex — but **do not do this in B6.** It
would churn the frozen pairing UX for little added safety.

Flash: skip this entirely. It's recorded here so it doesn't get re-raised.

---

## Suggested commit order

1. `Batch 6 (U-01): parked gate` — `drive-state.ts` + BridgeTab toggle + gates
2. `Batch 6 (U-05): first-run consent` — `FirstRunConsent.tsx` + App overlay
3. `Batch 6 (U-06): status-bar rung dot` — StatusBar + App wiring
4. `Batch 6 (S-08): wipe keys on this device` — providers + SettingsPanel

U-01 first because S-08 depends on `isParked()`. U-05 and U-06 are
independent and can go in any order.

---

## After you push

GLM will audit the B6 diff. Expect a report within the same session. Richard
adjudicates any findings before the next step (likely a road-test in the
Tucson per `DOCS/Tucson Testing Checklist.md`).

— GLM 5.2, chief auditor

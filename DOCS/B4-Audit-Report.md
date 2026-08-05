# B4 Audit Report — Trust Boundary

**Auditor:** GLM 5.2 (Architect/Auditor)
**Range:** `6f2eca0..04120ac` (4 commits: S-01, S-04, S-03, S-02)
**Plan:** `DOCS/B4-B6-Security-CalmUX-Plan.md`
**Date:** 2026-08-05
**Gates at HEAD:** `tsc -b` ✅ · `lint` ✅ (2 pre-existing tolerated warnings) · `build` ✅ · bundle token-scan ✅

---

## Verdict: **PASS** — Batch 4 is sound and ships the four trust-boundary
findings correctly. Three findings are clean. Two carry **minor** notes
(non-blocking; safe to address in B5 or a tidy-up). One carries an
**informational** note for the road-test.

No blocking issues. No frozen-contract violations. No invariant breaks.

---

## Per-finding audit

### S-01 — Origin-check + rate-limit the NIM proxy — ✅ CLEAN

**Commit:** `ba63ae5` · **File:** `api/nim-proxy.ts`

- Origin gate lives in the Vercel wrapper only, **not** in the shared
  `api/nim-handler.ts` — exactly per Flash refinement #2. `vite.config.ts`
  imports `handleNimProxyRequest` directly, so dev middleware is unaffected.
  Verified: `nim-handler.ts` was not touched in this batch.
- Missing `Origin` → 403. Correct default: the deployed app always sends an
  Origin on a same-origin POST, so absent Origin = script.
- `VERCEL_URL` auto-coverage + `ALLOWED_ORIGINS` allowlist for custom domains.
  Matches the plan's env note for Richard.
- Rate limit: in-memory, per-IP, 60s window, 30 req cap, map bounded at 5k
  keys. Honestly documented as a speed-bump (ephemeral instances). No
  dependencies added. ✅ honesty invariant.
- Error copy is Ario's own (`'Forbidden'`, `'Too many requests'`) — no raw
  platform leak. ✅ honesty.

**No issues.**

---

### S-04 — Remove `VITE_GITHUB_TOKEN` from the client bundle — ✅ CLEAN (1 minor)

**Commit:** `9a86a53` · **Files:** `mailbox.ts`, `gist-client.ts`,
`reflex-helpers.ts`, `SettingsPanel.tsx`, `.env.example`

- All three `import.meta.env.VITE_GITHUB_TOKEN` call sites removed. Grep at
  HEAD confirms zero matches in `src/` (only docs remain).
- `resolveToken()` / `getToken()` now return `null` when localStorage is
  empty/unavailable — correct, no silent env fallback.
- `SettingsPanel.tsx:204` copy updated to "stored in this browser only and is
  never bundled" — Flash refinement #1 landed. ✅ honesty.
- `.env.example` line removed with an explanatory comment.
- **Bundle scan:** `grep -oE "ghp_[A-Za-z0-9]{10,}" dist/` → no real token.
  The `ghp_...` string in the bundle is the input **placeholder**, not a
  credential. ✅ server-key boundary.

**Minor (non-blocking):** `README.md:26` still says
*"Optional: `VITE_GITHUB_TOKEN` at build time seeds a GitHub token for Gist
sync… the env var is only a fallback."* This is now inaccurate. The plan
scoped `.env.example` + the SettingsPanel copy; README wasn't listed. It's
documentation, not code, so it doesn't break the invariant — but it's a stale
claim that a future reader could act on. **Suggest a one-line README fix in
B5's tidy-up.**

---

### S-03 — Settings sync never auto-applies — ✅ CLEAN

**Commit:** `c90a30e` · **Files:** `settings-sync.ts`, `SettingsSyncPrompt.tsx` (new), `App.tsx`

- `initSettingsSyncListener` now **stages** (`pendingSettings = …; onPending(…)`)
  instead of applying. Nothing is written until Accept. ✅
- `takePendingSettings()` consumes + clears. Decline path calls it (discard)
  before nulling state. ✅ no write on decline.
- `applySyncedSettings` extracted as a `useCallback`; the apply body is
  byte-identical to the old inline block (keys, ollama url, agents, theme,
  model, system-entry event). No behaviour drift. ✅
- `SettingsSyncPrompt` is a **custom modal** (fixed overlay, `role="dialog"`,
  `aria-modal`) — no native popup. ✅ AA invariant.
- Buttons use `min-w-touch min-h-touch` (72px) — exceeds the glanceable
  target floor. ✅
- `SyncedSettings` shape untouched. `BridgeEnvelope` untouched. ✅ frozen contracts.
- `pendingSync` state lives in `App` (always mounted), so the prompt renders
  regardless of active tab. ✅

**No issues.**

---

### S-02 — SAS peer verification — ✅ CLEAN (1 minor, 1 informational)

**Commit:** `04120ac` · **Files:** `session.ts`, `types.ts`, `settings-sync.ts`, `BridgeTab.tsx`

This is the delicate one. Audited hardest.

**SAS derivation (`deriveSas`):**
- Reads **both** `localDescription.sdp` and `remoteDescription.sdp`
  fingerprints. ✅ fixes the audit's `getRemoteCertificates()` bug — both
  sides now share the same set.
- Regex `/a=fingerprint:(?:sha-256|sha-1)\s+([0-9A-Fa-f:]+)/` — matches the
  standard SDP line. `.toUpperCase()` normalises case before sort. ✅
- `[a, b].sort()` → canonical order → honest peers agree, MITM diverges. ✅
  The MITM argument in the commit body is correct: a relay runs two DTLS
  sessions, so each leg sees a different fingerprint pair.
- `crypto.subtle` guarded (`typeof crypto === 'undefined' || !crypto.subtle`
  → `null`). ✅ Flash refinement #3 landed — non-secure-context degradation
  is handled, not crashed.
- Digest: `SHA-256` → first 2 bytes → `% 10000` → 4-digit zero-padded. ✅
  10k space, matches the plan.

**State lifecycle:**
- `sas`/`sasVerified` reset in `stop()` ✅ and on every DataChannel `onopen`
  (`sasVerified = false`, recompute `sas`). ✅ re-pair re-verifies.
- `confirmSas()` no-ops when `sas === null` (can't confirm what wasn't
  derived). ✅ defensive.
- `getStatus()` returns `sas`/`sasVerified`. ✅

**Key-sync gate (`sendSettingsSync`):**
- `if (status.sas === null || status.sasVerified !== true)` → block with
  honest copy. ✅ This is the load-bearing guard: keys cannot move over an
  unverified link, even if S-03's Accept is clicked (S-03 protects the
  display's *write*; S-02 protects the hub's *send*). Defence in depth. ✅

**UI (`BridgeTab`):**
- Shows the 4 digits prominently on both devices when `rung === 'webrtc'` and
  `sas !== null`. ✅
- "Code matches" button → `confirmSas()`. ✅
- `sas === null` → honest fallback copy ("Couldn't verify this connection —
  keys won't sync until it's re-paired."). ✅ honesty.
- Button uses `min-h-14` (56px), matching the **established BridgeTab
  convention** (all 11 existing buttons use `min-h-14`). Not a regression.
  The modal in S-03 uses the larger `min-h-touch` (72px), which is fine.

**Frozen contracts:**
- `BridgeStatus` gained only the two **optional** fields (`sas`, `sasVerified`).
  No reorder, no rename. ✅ B3 precedent honoured.
- `BridgeEnvelope` untouched. ✅

**Minor (non-blocking):** `deriveSas()` is called in `onopen` as a fire-and-
forget `.then()`. If it rejects (e.g. `crypto.subtle.digest` throws in an
edge case), the promise is unhandled and `sas` stays `null` — which is the
*safe* state (sync blocked), so the failure mode is correct. But an unhandled
rejection would surface as a console warning. **Suggest a `.catch(() => {
this.sas = null; this.emitStatus(); })` in B5 tidy-up** to make the safe
state explicit and silence the warning. Not blocking — the current behaviour
is already safe.

**Informational (road-test):** The SAS code is derived from the **SDP
fingerprints**, which are present in `localDescription`/`remoteDescription`
once the DTLS handshake completes. On `onopen` these should be populated.
If, on a slow connection, `onopen` fires before `remoteDescription` is fully
set (theoretically possible with trickle ICE), `deriveSas` returns `null`
and the user sees "Couldn't verify." Re-pairing would fix it. This is an
edge case to watch in the Tucson test, not a code bug — the safe-fail
behaviour is correct.

---

## Invariant checklist

| Invariant | Status |
|---|---|
| Server-key boundary (no BYOK keys in bundle/mailbox) | ✅ S-04 bundle clean; NIM key stays server-side |
| No native popups | ✅ `SettingsSyncPrompt` is custom; no `<select>`/`<datalist>`/color input added |
| Viewport lock | ✅ untouched (no resize listeners added) |
| Honesty | ✅ all blocked/degraded paths surface Ario's own copy |
| Glanceable / sunlight-readable | ✅ big targets, turquoise digits on dark |
| ESM (no `require()`) | ✅ all imports are ESM |
| Frozen contracts | ✅ `BridgeEnvelope` untouched; `BridgeStatus` optional-only additions |

## Gates

- `npx tsc -b` — 0 errors ✅
- `npm run lint` — 0 errors, 2 pre-existing tolerated `App.tsx` warnings ✅
- `npm run build` — green ✅
- Bundle token scan — clean (no real token; `ghp_...` is placeholder text) ✅

---

## Summary

Batch 4 is **audited clean and approved**. The four trust-boundary findings
land in the correct order (S-03 before S-02, so the display is protected
even while SAS was being gotten right), the frozen contracts are intact, and
every invariant holds.

**Two minor non-blocking notes** for a B5 tidy-up:
1. `README.md:26` still advertises the removed `VITE_GITHUB_TOKEN` fallback.
2. `deriveSas()` `.then()` has no `.catch()` — safe-fail is correct, but an
   explicit catch would silence the unhandled-rejection warning.

**One informational note** for the Tucson road-test: watch for `sas === null`
on slow connections where `remoteDescription` may lag `onopen`. Re-pairing is
the correct recovery.

Ready for Qwen to fold these notes into the B5 plan, or for Richard to green-light B5.

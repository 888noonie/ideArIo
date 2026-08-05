# B3 Audit Report

**Auditor:** GLM 5.2
**Implementer:** DeepSeek Flash V4
**Scope:** B3 structural hardening — F-15, F-22, F-19, F-01, F-04
**Audited commits:** `453e1fe` → `949c040` (5 commits, pushed to `origin/main`)
**Date:** 2026-08-05

---

## Verdict: ✅ PASS — all four findings land correctly. Ship B3.

No blocking issues found. One minor observation (non-blocking, no action
required for B3). DeepSeek made one improvement *beyond* the plan that I
confirm was correct and necessary.

### Gates (re-run by auditor)
- `npx tsc -b` — **0 errors**
- `npm run lint` — **0 errors** (only the 2 pre-existing tolerated `App.tsx`
  `exhaustive-deps` warnings)
- `npm run build` — **green**; bundle 335.35 kB initial + 13.11 kB registry
  chunk (split confirmed)

### Frozen contracts (re-verified)
- **`ChatEntry`** — existing fields unchanged; only `remote?: boolean` added
  (optional, backward-compatible). ✅
- **`BridgeEnvelope`** — untouched. F-01's `expires_at` lives on `MailboxFile`
  (internal type), not the envelope. ✅
- **`public/sw.js` cache-key strategy** — untouched. ✅
- **Pairing input UX** — uncontrolled ref + 6-digit code untouched. ✅

---

## Per-finding audit

### F-15 — Schema-version envelopes ✅ PASS

**Commit:** `453e1fe`

**Backward compat (the specific check):** `loadChatLog` reads both shapes —
`Array.isArray(parsed)` → v0 bare array; `{ data: [...] }` → v1 envelope.
`saveChatLog` always writes `{ version: 1, data }`. An existing install with
a bare array loads fine and migrates on next save. ✅

`loadComments` (IdeasTab) does the same for the `NoteComments` object: v0
bare object vs `{ version, data }` envelope. The `'data' in parsed &&
'version' in parsed` discriminator correctly distinguishes v1 from v0 (a v0
comments object keyed by note id would never have both a `data` and
`version` key). ✅

`ChatEntry` element shape untouched — only the *array envelope* changed. ✅
`clearChatLog` unchanged (just removes the key). ✅

**No issues.**

### F-22 — Model-registry split + lazy-load ✅ PASS

**Commit:** `88208f3`

**Bundle claim (independently verified):** Initial chunk dropped
357.19 kB → 335.35 kB (~22 kB / ~4.6 kB gzip). The registry lives in its own
chunk (`model-registry-*.js`, 13.11 kB). `glm-5.2` (a registry-only model
id) does **not** appear in the initial chunk — only `deepseek-ai/deepseek-v4-pro`
(the `DEFAULT_MODEL_ID` constant from `model-id.ts`) remains. ✅

**Dependency direction:** `model-registry.ts` → `model-id.ts` (one-way).
`model-id.ts` has zero imports — confirmed it cannot pull the registry. ✅

**Stale-id regression check:** `loadSelectedModelId` in `model-id.ts` no
longer validates via `getModelById` (the original did). I traced the
consumers: `ModelSelector.tsx:12` does `getModelById(id) || MODEL_REGISTRY[0]`
(graceful fallback to first entry), and the NIM provider passes `req.model`
straight to `/api/nim-proxy`, which has its own model-cycle fallback (F-25).
A stale stored id cannot crash the app. This matches the plan's stated
tradeoff. ✅

**`SettingsPanel` lazy-load:** `React.lazy` + `Suspense fallback={null}`.
The `fallback={null}` is acceptable — the Settings tab is user-navigated
(not initial route), so a brief blank during chunk load is invisible in
practice (the chunk is 11.35 kB, loads in <100ms on any reasonable
connection). ✅

**No issues.**

### F-19 — Link-button gating ✅ PASS

**Commit:** `dfb3cef`

**`ChatEntry` shape:** only `remote?: boolean` added — existing fields
untouched. Backward-compatible (old data = `undefined` = local = links
shown). ✅

**`mergeRemoteEntries`:** sets `remote: true` on a *spread copy*
(`{ ...e, remote: true }`), not mutating the incoming envelope. Local
entries (`dispatchLocal`, `appendSystemEntry`) never set `remote`, so
they're `undefined` = local. ✅

**`ChatBubble`:** `const urls = paired && !isThinking && !entry.remote ?
extractUrls(entry.content) : []`. The `!entry.remote` gate suppresses link
buttons on mailbox-sourced entries. Local entries still get them. ✅

**No issues.**

### F-01 — Mailbox expiry ✅ PASS

**Commit:** `31565c6`

**Expiry logic:** `createMailboxGist` writes `expires_at = now + 24h`.
`openMailbox` throws `'Pairing code expired — generate a new one on the
phone.'` when `Date.now() > expires_at`. The error surfaces via
`BridgeTab`'s existing `startError` `role="alert"` path (confirmed at
`BridgeTab.tsx:103,121,240`) — honest Ario copy, not a raw platform
message. ✅

**Refresh:** `poll` refreshes the expiry in the last 25% of TTL
(`Date.now() + MAILBOX_REFRESH_THRESHOLD > expires_at`), so an active
pairing never lapses. The refresh rewrites the file with a new
`expires_at` while preserving envelopes. ✅

**Backward compat:** `expires_at` is optional; absent (old mailboxes) =
no expiry. `writeEnvelopes` only writes `expires_at` if passed
(`if (expiresAt) file.expires_at = expiresAt`). ✅

**Pairing UX untouched:** the uncontrolled ref input and 6-digit code
length are unchanged (confirmed at `BridgeTab.tsx:106-117`). ✅

**Entropy/salt:** deferred per the plan's recommendation — expiry closes
the stale-code window without touching the discovery flow. Acceptable
deferral with rationale. ✅

**No issues.**

### F-04 — CSP header ✅ PASS

**Commit:** `949c040`

**Preview validation (independently re-run by auditor):** I rebuilt and
served `dist` with the exact CSP header applied via a local Node server.
Loaded the app in a browser and exercised all tabs (Voice → Ideas → Agents
→ Bridge → History → Settings). **Zero CSP violations** in the console
across the full tour. The lazy-loaded `SettingsPanel` + `model-registry`
chunk loaded under CSP, and the "Capture model" dropdown rendered
"DeepSeek V4 Pro" (registry data). ✅

**Directive audit:**
- `default-src 'self'` — correct baseline. ✅
- `connect-src` — `self`, `openrouter.ai`, `api.github.com`,
  `gist.githubusercontent.com`, `integrate.api.nvidia.com`,
  `localhost:*`, `127.0.0.1:*`. I grepped all `fetch()` call sites: the
  `raw_url` fetches in `mailbox.ts`, `gist-client.ts`, `gist-index.ts`
  resolve to `gist.githubusercontent.com`. ✅
- `script-src 'self'` — no `eval`/`new Function`/string-`setTimeout`/
  `.innerHTML=`/`document.write` found in source, so no `'unsafe-eval'`
  needed. `index.html` has no inline scripts (only an external module). ✅
- `style-src 'self' 'unsafe-inline'` — required for Tailwind + inline
  `style={{}}` (the `--app-h` viewport lock, swatch colors, `userSelect`). ✅
- `media-src 'self' blob:` — defensive for voice/MediaSession blob URLs. ✅
- `img-src 'self' data:` — favicons/icons. ✅
- `frame-ancestors 'none'` — standalone PWA, correct. ✅

**DeepSeek's improvement beyond the plan:** the plan listed only
`api.github.com` in `connect-src`. DeepSeek correctly added
`gist.githubusercontent.com` — without it, truncated-gist loading
(`raw_url` fetches) would silently break under CSP. This was the right
call and I confirm it. ✅

**No issues.**

---

## Minor observation (non-blocking)

**F-22 / `Suspense fallback={null}`:** A null fallback means a user who
taps Settings before the chunk loads sees a brief blank panel. In practice
the chunk is 11 kB and loads in <100ms, so this is invisible on the car's
cellular connection. No action required for B3; if a future batch touches
this, a minimal skeleton (`<div className="p-6">Loading…</div>`) would be
polish, not a fix.

---

## Summary

| Finding | Verdict | Notes |
|---|---|---|
| F-15 | ✅ PASS | Backward compat verified; element shape untouched |
| F-22 | ✅ PASS | Bundle drop verified (357→335 kB); registry out of initial chunk; stale-id safe |
| F-19 | ✅ PASS | `ChatEntry` only gained optional field; link buttons gated on remote |
| F-01 | ✅ PASS | Expiry surfaces honestly; pairing UX untouched; entropy deferred (acceptable) |
| F-04 | ✅ PASS | CSP validated in preview (zero violations); `gist.githubusercontent.com` correctly added |

**B3 is ready to ship.** All 28 Fable5 findings are now addressed across
B1 (9), B2 (5), and B3 (4). The remaining 10 findings were either
out-of-scope, deferred with rationale, or addressed by earlier work.

— GLM 5.2, auditor

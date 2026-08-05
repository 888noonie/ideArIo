# AGENTS.md — ideArIo working agreement

This file orients any AI agent (or human contributor) opening the ideArIo
workspace. Read it before touching code.

## Project at a glance

ideArIo ("Ario") is a voice-first PWA for capturing ideas while driving,
built for an 8:3 Hyundai Tucson 2026 head unit running Android Automotive
via Fermata. React 19 + TypeScript + Vite 8 + Tailwind 3.4, deployed on
Vercel with a GitHub-Gist-backed bridge for phone↔car pairing.

- **Stack:** React 19, TypeScript, Vite 8, Tailwind 3.4, custom PWA (`public/sw.js`)
- **Providers (BYOK):** OpenRouter, Ollama (local), NVIDIA NIM (via `/api/nim-proxy`)
- **Bridge:** Gist mailbox (poll) → WebRTC DataChannel (upgrade), 6-digit pairing code
- **Gates (must stay green):** `npx tsc -b` (0 errors), `npm run lint` (oxlint, 0 errors — 2 pre-existing `exhaustive-deps` warnings in `App.tsx` are tolerated), `npm run build`

## Preferred workflow

This project uses a small multi-agent team. Each role has a clear lane;
nobody steps outside it without sign-off.

| Role | Who | Owns |
|---|---|---|
| **Architect / Auditor** | GLM 5.2 | Writes implementation plans, audits completed work (including catching its own bugs), adjudicates severity. Does NOT commit. |
| **Implementer / Landlord** | DeepSeek Flash V4 | Implements from GLM's plan, runs the gates, commits per-finding, pushes to `origin/main`. Cold-dump sync + byte-verified commits. |
| **Steerer** | Richard | Adjudicates audit findings, sets priorities, gives the go-ahead for each batch. The product owner. |

**Loop:** GLM writes plan → DeepSeek implements + runs gates → DeepSeek
commits per-finding + pushes → GLM audits → Richard adjudicates → next batch.

When GLM is implementing (as has happened in earlier sessions), the same
audit-after-implement discipline applies: implement, then audit your own
diff before declaring done. The F-24 `require()`-in-ESM bug is the canonical
example of why this matters — a "build succeeded" is not "the fix works."

## Invariants (do not break these)

These are field-learned for the AA/Fermata target. They are earned, not
cargo-culted — preserve them in any change.

1. **Server-key boundary:** BYOK keys never live in the client bundle or the
   Gist mailbox content. The NIM proxy keeps `NVIDIA_API_KEY` server-side;
   settings-sync over the bridge pushes keys over WebRTC only, never the
   mailbox. `public/sw.js` never caches `/api/*` or cross-origin.
2. **No native popups:** Zero `<select>`, `<datalist>`, or `<input type=color>`
   render paths — they crash the AA display server. Use `ListSelect` everywhere.
3. **Viewport lock:** `--app-h` is set once on load and intentionally NOT
   updated on resize/orientation. No resize listeners that would undo the lock.
4. **Honesty:** Errors surface Ario's own copy, never a raw platform message.
   (F-25's "raw Vercel timeout instead of Ario's body" was a finding precisely
   because it broke this.)
5. **Glanceable / sunlight-readable:** Big touch targets, reduced-motion honored,
   no sub-10px primary content.

## Environment notes

- **Network:** Development is done on a normal residential connection. Do not
  bias designs toward "flaky connectivity" assumptions during local work — the
  bridge/WebRTC resilience findings (F-08, F-09) are about the *car's* cellular
  environment, not the dev machine. Field validation happens in the actual car
  (Stage A), not at the desk.
- **ESM:** The project is `"type": "module"`. Never use `require()` in config
  or source — use ESM `import`. (This bit F-24; see the B2 audit notes.)
- **Dev NIM:** `npm run dev` serves a mock NIM response when `NVIDIA_API_KEY` is
  absent; set `VITE_USE_MOCK_NIM=true` to silence the warning. `src/lib/nim-mock.ts`
  is dev-only (consumed by `vite.config.ts`), NOT dead code.

## Commit conventions

- One commit per finding, prefixed `Batch N (F-XX):` — matches the B1/B2 history.
- Commit body: what was wrong, what changed, why. Keep it skimmable.
- Never commit the untracked `DOCS/Fable5-Audit-Report.md` or the audit prompt —
  they are working documents, not source.
- `tsconfig.api.tsbuildinfo` is a build artifact — leave it untracked.

## Where things live

- `src/lib/bridge/` — session ladder, mailbox, types (FROZEN: `BridgeEnvelope` shape)
- `src/lib/chat-engine.ts` — `ChatEntry` shape (FROZEN), log load/save, dispatch
- `src/lib/model-registry.ts` — 790-line model list (F-22 lazy-load target)
- `src/lib/crew-audio.ts` — speech synthesis + MediaSession
- `src/lib/providers/` — OpenRouter, Ollama, NIM provider adapters
- `api/nim-handler.ts` — shared NIM proxy logic (Vercel + dev middleware)
- `public/sw.js` — service worker (cache keys tied to git SHA via `vite.config.ts`)
- `DOCS/BRIDGE.md`, `DOCS/PROVIDERS.md` — deeper docs; root README links to them

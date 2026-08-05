# FABLE 5 — ideArIo Full-Repo Audit & Production Roadmap

> **Mission briefing for Anthropic Fable 5, invoked via OSSCODE on a local clone.**
> Execute the stages below IN ORDER. Do not skip Stage 0 — auditing a stale tree is a wasted run.

---

## STAGE 0 — BRING THE STALE REPO CURRENT (mandatory, do this first)

Your local clone of **ideArIo** is stale. The repo has just landed a major roadtest-fix round
(18 files, 11 commits) on `main`. Sync BEFORE doing anything else:

```bash
# 1. Confirm the remote
git remote -v
#   origin must be https://github.com/888noonie/ideArIo.git
#   If missing/wrong: git remote set-url origin https://github.com/888noonie/ideArIo.git

# 2. Preserve anything local (report it if it exists — do NOT silently discard)
git status
#   If dirty or on a detached/old branch: git stash push -m "fable5-pre-sync" and REPORT it.

# 3. Sync hard to remote main
git fetch origin --prune
git checkout main
git reset --hard origin/main

# 4. VERIFY — non-negotiable checkpoint
git log -1 --format='%H %s'
#   MUST print: 55b3a52b12cebb3a3b9cfdf706a43ea9d9a3e867 roadtest: chat + upload button, mic stub, persistent active agent, paired auto-scroll
#   If it does not, STOP and report the divergence instead of auditing.

# 5. Prove the tree is healthy BEFORE auditing
npm install
npx tsc -b        # expect: clean
npm run lint      # expect: 0 errors (2 tolerated exhaustive-deps warnings in App.tsx — dep intentionally managed via processCommandRef)
npm run build     # expect: ~355 kB bundle (index-*.js, gzip ~105 kB)
```

If any gate fails on a clean, freshly-synced `main`, that failure is **Finding #0** of your audit.

**Read-only constraint:** this is an audit. Do NOT commit, push, open PRs, or modify the remote.
Local scratch work is fine; deliverables are documents, not code changes.

---

## STAGE 1 — ABSORB THE PRODUCT CONTEXT (before judging anything)

**ideArIo** is a voice-first, multi-agent AI co-pilot for the CAR. Primary runtime is an
**Android Automotive / Fermata Auto WebView** on a car display, optionally paired with a phone
acting as hub. It is NOT a desktop chat app — every design judgment must be made through the
lens of a driver at 70 mph on low-power automotive hardware.

**Stack:** React 19 + TypeScript + Vite 8 + Tailwind 3.4, PWA (custom `public/sw.js`), deployed
on Vercel with one serverless function (`/api/nim-proxy`).

**Architecture you will find in the tree:**
- **6-tab shell** — Voice Chat (merged voice bar + full multi-agent ChatPanel), Ideas, Agents,
  Bridge, History, Settings (`src/App.tsx`, `src/components/TabBar.tsx`).
- **BYOK providers** — OpenRouter (browser key), Ollama (local), NVIDIA NIM (server-side key via
  Vercel proxy) in `src/lib/providers/`. Optional `healthCheck()` per provider.
- **Bridge** — phone(hub)↔display pairing with a transport ladder: WebRTC → Gist mailbox →
  offline (`src/lib/bridge/`). Chat entries mirror hub→display; display input forwards to hub.
- **Trust spine + reflex lane** — `src/lib/trust.ts`, `src/lib/reflex.ts`: instant local commands
  (queue link, trust change, etc.) run BEFORE any LLM dispatch.
- **Crew audio** — TTS replies when enabled (`src/lib/crew-audio.ts`).
- **Wake-word router + persistent agents** — "Hey Kimi, …" routing (`src/lib/wake-router.ts`,
  `src/lib/agents.ts`); active agent persists in `ideario-active-agent`.
- **Settings sync** — hub pushes keys/agents/theme/model to the display, WebRTC rung ONLY
  (`src/lib/settings-sync.ts`).

## HARD INVARIANTS — do not propose violating these

1. **Key custody:** BYOK keys live ONLY in browser `localStorage` (`ideario-key-*`). They are
   never committed, never sent anywhere except their own provider endpoint, and NEVER transit
   the Gist mailbox. Settings sync may carry keys only over the WebRTC rung (hub→display,
   display never echoes). Token resolution: `localStorage ideario-github-token` →
   `VITE_GITHUB_TOKEN` build-time fallback. No hardcoded secrets anywhere.
2. **AA/Fermata display-server constraints (field-learned, hard-won):**
   - NO native `<select>`, `<datalist>`, or `<input type="color">` — native popups crash the
     host display server. All pickers are the inline `ListSelect` component
     (`src/components/ui/ListSelect.tsx`). If you propose replacing it, your replacement must be
     provably popup-free.
   - The pairing-code input is deliberately UNCONTROLLED (`defaultValue` + ref) because the
     Fermata virtual keyboard does not reliably drive controlled React inputs.
   - The shell height is locked ONCE on load via `--app-h` (viewport resize jitter from
     keyboard/chrome used to bounce the layout). Do not "fix" this into a resize listener.
   - Paired mode: `overscroll-behavior: none`, `scroll-behavior: auto` — smooth scrolling reads
     as viewport jumps on the car display.
3. **Driver safety outranks feature richness:** glanceable type, minimal interaction depth,
   large touch targets (≥ 56–64px), reduced-motion support.
4. **Honesty invariant:** no fake success states. If something can't run (NIM health check,
   non-.txt/.md uploads), the UI says so plainly. Preserve this.

---

## STAGE 2 — THE AUDIT (the main event)

Audit the ENTIRE repo, not just the diff. For EACH dimension below, produce findings — or an
explicit "no issues found; inspected X, Y, Z" line. Every finding MUST carry:
**severity** (CRITICAL / HIGH / MEDIUM / LOW / INFO) · **file:line evidence** ·
**why it matters in-car specifically** · **recommended fix** · **effort** (S/M/L).

1. **Architecture & organization** — module boundaries, coupling, dead code (note:
   `src/components/VoicePanel.tsx` is now legacy/unreferenced — assess removal vs retention).
2. **Security & privacy** — key custody paths, token flows, WebRTC signaling hygiene, Gist
   mailbox content (what CAN leak there?), XSS surface in chat rendering, missing CSP, service
   worker cache poisoning surface.
3. **Driver-distraction UX & accessibility** — ARIA correctness, glanceability, color contrast
   on a sunlight-readable display, reduced-motion coverage, interaction depth while driving.
4. **Performance on low-power hardware** — 355 kB bundle: what can be code-split or lazily
   loaded; render hot paths in ChatPanel; localStorage write amplification (chat log saves on
   every entry); unnecessary re-renders; wake-word recognizer cost.
5. **Resilience & offline** — bridge ladder degradation, reconnect storms, SW update strategy
   (`public/sw.js`), queueing of outbound work, behavior when providers time out mid-reply.
6. **Voice pipeline** — speech-recognition edge cases (no-speech, aborted sessions, mobile
   hiccups), wake-word false triggers, TTS interruption/overlap, crew-audio queue behavior.
7. **Data layer** — localStorage schema versioning/migration (new keys landed this round:
   `ideario-active-agent`, `ideario-display-mode`, `ideario-note-comments`), unbounded growth of
   `ideario-chat-log` / `ideario-note-comments`, IndexedDB vs localStorage fit, corruption
   recovery.
8. **PWA & deploy** — `sw.js` cache versioning, Vercel config, `/api/nim-proxy` error/timeout
   behavior, env-var documentation, installability on the car display.
9. **Testing & CI** — there is no test suite. Specify the MINIMUM high-value test set (pure
   libs first: wake-router, reflex, settings-sync gate, providers) and a CI gate workflow.
10. **Docs & onboarding** — README accuracy vs. the 6-tab reality, `DOCS/BRIDGE.md` freshness,
    in-repo setup steps for BYOK keys/Ollama/`NVIDIA_API_KEY`.

## THE SECOND-LOOK MANDATE (why YOU specifically are here)

Richard's swarm built this; you are the outside pair of eyes. Beyond the ten dimensions,
actively hunt for:
- **Illogical or over-complicated flows** — places where a simpler design achieves the same
  outcome (state mirrored in two places, effects fighting each other, ref-workarounds that
  could be eliminated).
- **Hidden coupling** — e.g. components importing window events/constants across files
  (`CHAT_SYSTEM_ENTRY_EVENT`), singleton session usage, implicit localStorage contracts
  scattered across modules.
- **Missing failure modes** — what breaks at 3 AM in a parked car with flaky Wi-Fi?
- **Over-engineering** — anything built for scale this product will never need, where deleting
  code reduces risk.
- **Under-engineering** — anywhere "it works on my devices" is standing in for correctness.

If you disagree with an existing decision, argue it WITH evidence — but respect that several
odd-looking choices are field-learned AA/Fermata workarounds (see invariants). Flag any you
believe are cargo-culted rather than earned, and say what field test would settle it.

---

## STAGE 3 — DELIVERABLES (exact format)

Produce ONE markdown report:

1. **Repo sync confirmation** — HEAD SHA observed, gate results (tsc/lint/build), anything
   stashed/reported from Stage 0.
2. **Executive summary** — the top 5 risks to a production in-car deployment, one line each.
3. **Findings register** — table: ID · severity · dimension · file:line · one-line summary ·
   effort. Followed by per-finding detail sections.
4. **Second-look section** — the illogical/missed/over/under-engineered items, argued.
5. **Staged roadmap** — the path to "ultimate production-grade in-car product":
   - **Stage A — Field validation:** real-hardware tests that settle the code-verified-only
     questions (AA crash fix, keyboard input, viewport lock, scroll stability, settings sync
     over WebRTC). Define the test script a human can run in the car.
   - **Stage B — Hardening:** all CRITICAL/HIGH findings, with entry/exit criteria.
   - **Stage C — Production grade:** test suite + CI, release/versioning process, error
     reporting that respects the no-server key-custody model, docs completion.
   - **Stage D — Product expansion:** only what earns its place for a driver (e.g. comment
     sync, idea↔chat linkage, model management) — each with a one-paragraph justification.
   Every roadmap item must reference finding IDs, carry an effort estimate and risk note.
6. **Swarm decomposition sketch** — Richard implements with a 2-coder swarm under strict
   disjoint file ownership + frozen contracts. For Stage B, propose the workstream split
   (which files each coder owns, what contracts must be frozen between them).

## ACCEPTANCE CRITERIA

- Stage 0 checkpoint verified (correct HEAD SHA quoted, gates run).
- All 10 dimensions addressed explicitly.
- No finding without file:line evidence; no severity inflation without justification.
- Roadmap stages have entry/exit criteria and trace back to finding IDs.
- Zero code pushed anywhere. Tone: senior, direct, no compliments, no hedging.

The car is waiting. Begin with Stage 0.

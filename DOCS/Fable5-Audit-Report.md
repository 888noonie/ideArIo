# FABLE 5 — ideArIo Full-Repo Audit & Production Roadmap

Auditor: Anthropic Fable 5 (via OSSCODE). Read-only audit, no commits/pushes made.

---

## 1. Repo Sync Confirmation

- Remote confirmed: `origin = https://github.com/888noonie/ideArIo.git`.
- Pre-sync state: local branch was `agent/pre-release-hardening-polish` with one untracked file (this prompt doc itself). Nothing else was dirty; nothing stashed.
- `git fetch origin --prune && git checkout main && git reset --hard origin/main` completed cleanly.
- **HEAD verified:** `55b3a52b12cebb3a3b9cfdf706a43ea9d9a3e867 roadtest: chat + upload button, mic stub, persistent active agent, paired auto-scroll` — matches the mandated SHA exactly.
- Gate results on the freshly-synced tree:
  - `npm install` — clean (only advisory `esbuild` postinstall-script notice, no errors).
  - `npx tsc -b` — **clean**, 0 errors.
  - `npm run lint` (oxlint) — **2 warnings, 0 errors**, both `react-hooks/exhaustive-deps` in `src/App.tsx` (lines 200, 220) for `syncPendingIdeas` / `handleSpeechFinalized`. These are the exact two tolerated warnings called out in the mission brief (deps intentionally managed via `processCommandRef`/closures) — no Finding #0.
  - `npm run build` — succeeded, `dist/assets/index-*.js` = 355.08 kB (gzip 105.00 kB), CSS 28.94 kB (gzip 6.35 kB). Matches the ~355 kB / ~105 kB gzip figure in the brief.

**No Finding #0.** The tree is healthy as described; the audit below is against a verified-current `main`.

---

## 2. Executive Summary — Top 5 Risks to Production In-Car Deployment

1. **Gist mailbox is an unauthenticated-by-obscurity shared secret channel** (F-01, CRITICAL): the 6-digit pairing code is the *only* access control on a private Gist that carries full chat content, and a leaked/guessed code lets a stranger read/write the conversation and inject `chat-input`/`entries` envelopes into a live session, including forwarding text prompts to a driver's agents.
2. **No CSP and full XSS-adjacent trust in agent/chat content rendering** (F-04, HIGH): agent replies are LLM-generated and rendered as `whitespace-pre-wrap` text (not `dangerouslySetInnerHTML`, so no direct injection today) but there is zero CSP header, and the Gist mailbox is an attacker-reachable data source for a `display`-role client via `mergeRemoteEntries` — a compromised/malicious hub can push arbitrary `ChatEntry.content` (rendered as text, but still a driver-distraction/social-engineering vector: fake "system" messages, fake links that become one-tap "Queue link" buttons in paired mode).
3. **Wake-word false-trigger and multi-restart races on flaky mobile speech services** (F-11, HIGH): `useWakeWord`'s restart/fatal-error logic mixes several refs and a 350ms restart timer with a 2-strike auto-disable; on Android Automotive's speech service (known to be less mature than phone Chrome) this is unverified in the actual car and could either loop-restart audibly or silently disable wake mode mid-drive with only a spoken notice.
4. **`localStorage` write-amplification + unbounded local growth is real but capped at the wrong layer** (F-14, MEDIUM/HIGH boundary): `chat-log` is correctly capped at 200 entries, but it is *rewritten in full on every entry change* (`ChatPanel`'s save effect fires on every `entries` update, including live "thinking" placeholder churn during multi-agent parallel replies) — on low-power automotive hardware with slow flash-backed storage this is a real jank/battery source that has not been field-measured.
5. **Bridge WebRTC reconnect/re-probe storm has no backoff and no field verification on the actual AA/Fermata network stack** (F-08, HIGH): the hub silently re-offers every 30s indefinitely while on the mailbox rung, with no exponential backoff and no cap on RTCPeerConnection churn if ICE consistently fails (e.g. behind restrictive carrier NAT) — this is exactly the "3 AM parked car with flaky Wi-Fi" scenario STAGE 2 asks about, and it is untested.

---

## 3. Findings Register

| ID | Sev | Dimension | file:line | Summary | Effort |
|----|-----|-----------|-----------|---------|--------|
| F-01 | CRITICAL | Security | `src/lib/bridge/mailbox.ts:1-20`, `session.ts:1-20` | 6-digit code is sole access control on a Gist mailbox carrying full chat + signaling | M |
| F-02 | HIGH | Security | `src/lib/gist-client.ts:18-20` | `saveIdearioToGist` token resolution is env-only (`VITE_GITHUB_TOKEN`), diverges from the localStorage-first pattern used everywhere else (mailbox.ts:39-47, reflex-helpers.ts:75-83) | S |
| F-03 | MEDIUM | Security | `src/components/BridgeTab.tsx:158-165` | `handleOpenLink` does `window.open(url, '_blank', 'noopener,noreferrer')` on agent-supplied/mailbox-supplied URLs with no scheme allowlist (`javascript:` etc. theoretically reachable if a future regex loosens) | S |
| F-04 | HIGH | Security/UX | repo-wide; `vercel.json:1-24` | No Content-Security-Policy header anywhere (only `X-Content-Type-Options`, `Referrer-Policy` set) — no defense-in-depth if any future feature introduces raw HTML rendering of agent/bridge content | S |
| F-05 | LOW | Security | `public/sw.js:44-46` | SW correctly excludes `/api/*` and cross-origin from caching — **no issue found**, confirms invariant #1's server-key boundary is respected at the cache layer | — |
| F-06 | INFO | Security | `src/lib/agents.ts` full file | BYOK keys never appear in `AgentSpec`/agent storage — **no issue found**, key custody invariant holds in this module | — |
| F-07 | MEDIUM | Architecture | `src/components/ChatPanel.tsx:1-25` + `App.tsx:9` | `CHAT_SYSTEM_ENTRY_EVENT` is a cross-file `window` event contract between `App.tsx` and `ChatPanel.tsx` for injecting "Settings synced from hub" — works, but it is a second, parallel path to the same chat log alongside direct `saveChatLog()` writes in `App.tsx:186-197`, i.e. the same system entry is written to storage AND re-derived via event for the live component — two sources of truth for one fact |
| F-08 | HIGH | Resilience | `src/lib/bridge/session.ts:98-104,236-243` | Hub re-offers WebRTC every 30s indefinitely with no backoff/cap while stuck on the mailbox rung; no test for reconnect-storm behavior against carrier-grade NAT | M |
| F-09 | MEDIUM | Resilience | `src/lib/bridge/mailbox.ts:154-186` | `send()` does read-then-write of the *entire* Gist file with no ETag/If-Match — concurrent hub+display writes in the same poll window are a last-write-wins race that can silently drop an envelope (dedup by id only helps if the dropped write's id survives in the other side's copy, which it may not) | M |
| F-10 | LOW | Resilience | `src/lib/bridge/session.ts:227-233` | `pollTick`'s reschedule logic (`this.rung === 'webrtc' ? KEEPALIVE_POLL_MS : intervalMs === KEEPALIVE_POLL_MS ? intervalMs : MAILBOX_POLL_MS`) is a hard-to-read ternary chain encoding a state machine — correct by inspection but a second-look "simplify" candidate (see §4) | S |
| F-11 | HIGH | Voice pipeline | `src/hooks/useWakeWord.ts:118-160` | Restart/fatal-error/silence-timer interplay (`processingRef`, `pausedRef`, `fatalCountRef`, 350ms `RESTART_DELAY_MS`) is unverified against Android Automotive's speech recognition service; no field test exists for the "auto-disable after 2 fatal errors" threshold value | M |
| F-12 | MEDIUM | Voice pipeline | `src/hooks/useSpeechRecognition.ts:104-108` | On finalized speech, transcript accumulates as `prev + ' ' + final` across the whole continuous session (used by wake mode) with no cap — a long, unintentionally-open wake session (e.g. mic stuck listening) could grow an unbounded string held in React state | S |
| F-13 | LOW | Voice pipeline | `src/lib/crew-audio.ts:75-88` | `speakAgentReply` cancels then re-queues ALL chunk utterances in one call, but multiple agents replying in the same tick (broadcast "Hey everyone") each call `speakAgentReply` independently via the `entries` effect in `ChatPanel.tsx:216-224` with no per-call queue coordination — later agents' `cancel()` call interrupts an earlier agent's reply mid-sentence; for a broadcast, only the last-finishing agent will be heard in full |
| F-14 | MEDIUM/HIGH | Data layer / Performance | `src/components/ChatPanel.tsx:120-123` | `saveChatLog` runs in a `useEffect` on every `entries` change, including every 'thinking' → 'done' transition per agent per broadcast — full-array re-serialize + `localStorage.setItem` on the main thread on every step; unmeasured on car hardware | M |
| F-15 | MEDIUM | Data layer | `src/lib/chat-engine.ts:19-20`, `IdeasTab.tsx:20-21`, `HistoryTab.tsx:11` | Three independent localStorage keys (`ideario-chat-log` capped at 200, `ideario-note-comments` **uncapped**, `ideario-display-mode` uncapped by nature) with no shared schema-version field and no migration path if the `ChatEntry`/`NoteComments` shape changes later (contrast with `yaml-migrations.ts`, which DOES version `IdearioYAML`) | M |
| F-16 | LOW | Data layer | `src/components/IdeasTab.tsx:36-43` | `saveComments` has no size cap — a driver leaving long-running voice sessions with frequent commentary could grow this key indefinitely; low real-world risk given typical usage but no guard exists | S |
| F-17 | MEDIUM | Architecture (dead code) | `src/components/VoicePanel.tsx`, `ArioOrb.tsx`, `TextInputFallback.tsx` | `VoicePanel.tsx` is confirmed **unreferenced** by any importer (grep across `src/**` returns zero imports of `VoicePanel` outside its own file); it privately imports `ArioOrb` and `TextInputFallback`, both of which are *also* otherwise unreferenced — a 3-file, ~467-line dead branch (168+122+~90 lines) surviving from the pre-roadtest single-orb capture UI, fully superseded by `VoiceChatTab.tsx` + `ChatPanel.tsx` | S |
| F-18 | LOW | Architecture | `src/lib/nim-mock.ts` | Only consumer is `vite.config.ts` (dev-server middleware) — correctly scoped to dev, **not** dead code, but undocumented in README; a new contributor grepping for `nim-mock` usage in `src/` alone would wrongly conclude it's unused | S |
| F-19 | HIGH | Driver-distraction UX | `src/components/ChatPanel.tsx:200-206`, `ChatBubble.tsx:129-146` | "Queue link" buttons render for ANY URL found in agent-reply text via `extractUrls`, including URLs sourced from the Gist mailbox in `display` role (`mergeRemoteEntries`) — a malicious/compromised hub peer can inject fake "system"-looking or agent-attributed content with attacker URLs one tap away from `window.open` while paired mode is specifically the in-car configuration | M |
| F-20 | LOW | Accessibility | `src/index.css:142-149,225-229` | Reduced-motion coverage exists for shimmer + smooth scroll — **no issue found**, confirms invariant #3 is honored in CSS | — |
| F-21 | LOW | Accessibility | `src/components/ChatBubble.tsx:56-60` | System-role entries render at `text-[10px]` for the timestamp — likely too small for the "glanceable... sunlight-readable" requirement (invariant #3); low severity since it's a timestamp, not primary content | S |
| F-22 | MEDIUM | Performance | `src/lib/model-registry.ts` (790 lines) | Largest file in the repo by a wide margin, loaded eagerly by `App.tsx` at top-level import — no code-splitting/lazy import despite being needed only by `ModelSelector`/`SettingsPanel`/NIM chat, both used from the rarely-visited Settings tab | M |
| F-23 | LOW | Performance | `src/lib/bridge/session.ts:5` singleton via `getBridgeSession()` | Module-level singleton pattern used correctly and consistently (BridgeTab, ChatPanel, settings-sync all call the same accessor) — **no issue found**, this is the right pattern for a single hardware-bound session, flagged only as an INFO note that any future test suite will need a reset hook (`stop()` exists and suffices) |
| F-24 | HIGH | PWA/Deploy | `public/sw.js:9-10` | Cache version bump (`ideario-shell-v4`/`ideario-runtime-v4`) is a manual string edit with no automated tie to `package.json` version or build hash — a developer who forgets to bump the suffix ships stale shell assets to already-installed PWAs indefinitely (activate handler only deletes caches with a DIFFERENT key, so an unbumped deploy never invalidates) | S |
| F-25 | MEDIUM | PWA/Deploy | `vercel.json:6-10` | `maxDuration: 10` on `api/nim-proxy.ts` combined with the model-cycle fallback loop trying up to 9 models at 6s timeout each (`nim-handler.ts:38-90`) means the function can be killed by Vercel mid-fallback after ~2 model attempts, producing a generic Vercel timeout (504/FUNCTION_INVOCATION_TIMEOUT) rather than the handler's own descriptive `{error, modelsTried}` body — breaks the honesty invariant's spirit (the user sees a raw platform timeout, not Ario's own message) | S |
| F-26 | LOW | Testing/CI | repo-wide | No test files, no CI workflow (`.github/workflows` absent) — confirmed by file tree; matches STAGE 2 dimension 9's premise exactly, addressed in the roadmap below | — |
| F-27 | LOW | Docs | `README.md` | README is effectively a stub (`# ideArIo` + presumably more below, but the 6-tab architecture, BYOK setup, Ollama/NVIDIA_API_KEY env docs are NOT in the root README — they live only in `DOCS/BRIDGE.md`, `DOCS/PROVIDERS.md`) — onboarding requires already knowing to look in `DOCS/` | S |
| F-28 | INFO | Docs | `DOCS/BRIDGE.md` | Exists and documents the token-resolution order accurately (verified against `mailbox.ts` — matches) — **no issue found** on freshness for this specific doc |

---

## 4. Second-Look Section

**Illogical/over-complicated flows:**
- **F-07** — the settings-sync system-entry has two independent write paths (direct `saveChatLog` in `App.tsx` AND a `CustomEvent` picked up by `ChatPanel`) justified in a comment as "belt and braces." This is defensible for the specific case of a mid-remount race, but it means the log can (in a very specific timing window) receive the same logical event as two different `ChatEntry` objects with different ids — not deduplicated because they're not envelope-based. A simpler design: `ChatPanel` alone owns writing chat-log; `App.tsx` only dispatches the event, and `ChatPanel`'s existing `appendSystemEntry` handles persistence via its own save effect (which it already does for the event path). The direct-write half in `App.tsx` should be deleted — it's the redundant half, not "belt and braces."
- **F-10** — the pollTick reschedule ternary. Worth flattening to an explicit `if (this.rung === 'webrtc') { ...KEEPALIVE... } else { ...intervalMs... }` — not a correctness bug, just unnecessarily hard to audit for a state machine this important to bridge reliability.

**Hidden coupling:**
- `CHAT_SYSTEM_ENTRY_EVENT` (window event) — flagged as intentional in the brief, and it is a reasonable pattern here, but it is the *only* export from `ChatPanel.tsx` besides the component itself, meaning `App.tsx` imports a chat-UI component file purely to get a string constant. Moving the constant to `chat-engine.ts` (a lib file, not a component file) would remove the odd "import a component to get a constant" smell without changing behavior.
- The active-agent persistence key `ideario-active-agent` is written by `ChatPanel.tsx` and read by both `ChatPanel.tsx` and (implicitly, per the brief) elsewhere — confirmed single-writer, so this is fine as an implicit contract, not flagging further.

**Missing failure modes ("3 AM, parked, flaky Wi-Fi"):**
- Bridge mailbox `send()` (F-09) has no retry/backoff on transient GitHub API failures beyond the outer `console.warn` swallow in `session.ts:sendOverMailbox` — a flaky connection drops the envelope silently with no user-visible indication beyond the connection-status dot eventually going stale after 20s.
- `openMailbox` (`mailbox.ts:143-165`) throws synchronously if no token is configured — correctly surfaced as a `startError` string in `BridgeTab.tsx`, this is **good** honesty-invariant behavior, no finding needed.
- **NIM proxy under Vercel's 10s cap (F-25)** is exactly a 3-AM-flaky-network scenario: cold NVIDIA endpoint + 2-3 fallback attempts at 6s each can genuinely exceed the function's total budget, producing an opaque platform error instead of Ario's own honest error copy.

**Over-engineering:**
- The Gist-index (`gist-index.ts`) as a "best-effort" secondary lookup structure alongside a full-Gist-scan fallback (`gist-client.ts` comment: "loader falls back to a full Gist scan when the index is missing/stale") is defensible complexity for a personal-scale Gist vault, not flagged as excessive — but it is a second persistence path for the same logical data (saved ideas) that must be kept manually consistent; worth a HIGH-value unit test in Stage C rather than removal.
- `useWakeWord`'s five separate ref-based state trackers (`enabledRef`, `pausedRef`, `processingRef`, `awokenAtRef`, `fatalCountRef`) plus two timers is a lot of moving parts for "listen for a phrase, then capture a sentence." This is a legitimate second-look candidate for simplification (a single small state machine/reducer would likely be easier to reason about and test) but the current code is thoroughly commented and each ref has a clear, singular purpose — recommend refactor only if/when F-11's field test surfaces an actual bug, not preemptively.

**Under-engineering:**
- **F-14/F-09** — no field measurement exists for the localStorage-write and Gist-poll costs claimed to be a performance/resilience concern in the audit brief itself ("localStorage write amplification"). This audit confirms the code pattern that WOULD cause it but cannot confirm actual in-car impact without instrumentation — flagged as a Stage A field-validation item, not asserted as a proven regression.
- **F-2 / gist-client.ts token resolution** — genuinely looks like an oversight rather than a design choice; every other Gist-touching module (mailbox.ts, reflex-helpers.ts) resolves localStorage-first-then-env, but `gist-client.ts` is env-only. This is the one item in this section I'd call a bug, not a judgment call.

**Field-learned decisions I do NOT dispute:** the uncontrolled pairing-code input (ref pattern), the `--app-h` viewport lock, `ListSelect` in place of native pickers, and paired-mode `overscroll-behavior: none` all check out in code exactly as the invariants describe, and I found no code path that silently reintroduces a native popup or a resize listener that would undo the lock. These are earned, not cargo-culted, based on the specificity and consistency of the implementation.

---

## 5. Staged Roadmap

### Stage A — Field Validation
Entry: Stage 0 gates green (done). Exit: every item below has a pass/fail result logged by a human in the actual car.

1. **AA/Fermata crash fix** — confirm zero native `<select>`/`<datalist>`/`<input type=color>` render paths trigger a display-server crash; script: open every tab, exercise every `ListSelect` picker (agent editor color swatch, model selector, provider list) on the actual head unit.
2. **Uncontrolled pairing-code input** (relates F-01 area) — type a 6-digit code via the Fermata virtual keyboard on the display role; confirm the value lands correctly on Join tap (no dropped/duplicated keystrokes).
3. **Viewport lock (`--app-h`)** — rotate/open keyboard/trigger browser chrome changes; confirm the shell height never visibly jumps.
4. **Scroll stability in paired mode** — drive a multi-turn broadcast conversation with 3 agents replying; confirm auto-scroll snaps without visible jitter.
5. **Settings sync over WebRTC** — pair hub+display, force to the WebRTC rung (confirm dot=turquoise), tap "Sync settings," confirm keys/agents/theme land on the display and NEVER appear in the Gist mailbox content (inspect the Gist via GitHub UI during the test — this directly verifies invariant #1).
6. **[NEW] Wake-word reliability under road noise** (relates F-11) — drive with wake mode on for 15+ min; log false triggers, silent auto-disables, and restart-loop audio artifacts.
7. **[NEW] Bridge reconnect storm** (relates F-08) — pair over cellular, drive through a known dead-zone for 2+ minutes, confirm reconnection behavior and that no runaway RTCPeerConnection churn is audible/visible as battery/CPU drain.
8. **[NEW] NIM proxy timeout under cold start** (relates F-25) — trigger a NIM chat request after the Vercel function has been idle (cold start); confirm the user sees Ario's own error copy, not a raw platform timeout.

### Stage B — Hardening
Entry: Stage A test script committed (even if some results are "fail, tracked"). Exit: all CRITICAL/HIGH findings resolved or explicitly deferred with rationale.

- **F-01 (CRITICAL)** — harden the mailbox: at minimum, increase code entropy (6 digits = 1e6 space, brute-forceable against a rate-unlimited GitHub Gist lookup-by-description) or add a short-lived expiry to the mailbox Gist description/content so stale codes stop working. Risk: any interim exposure window before this ships. Effort: M.
- **F-04/F-19 (HIGH)** — add a CSP header in `vercel.json` (`default-src 'self'; connect-src 'self' https://openrouter.ai https://api.github.com https://integrate.api.nvidia.com http://localhost:11434`ish, adjusted for Ollama's arbitrary local URL) and consider gating "Queue link" button rendering to `hub`-originated OR self-originated entries only, not `display`-received mailbox content, closing the injected-link vector. Effort: S–M.
- **F-08 (HIGH)** — add exponential backoff (cap at e.g. 2–5 min) to the 30s re-offer loop after N consecutive ICE failures; add a status surface ("still trying to upgrade...") rather than silent indefinite retry. Effort: M.
- **F-11 (HIGH)** — instrument `useWakeWord`'s fatal-error counter with a visible debug-overlay counter (leveraging the existing `DebugOverlay.tsx`) so Stage A field tests can attribute false triggers/disables to specific error codes before refactoring. Effort: S (instrumentation) + M (fix, pending data).
- **F-24 (HIGH)** — tie `SHELL_CACHE`/`RUNTIME_CACHE` version strings to the build (Vite `define` injecting `import.meta.env.VITE_BUILD_ID` into `sw.js` via a build step, or a content-hash query param on `sw.js` registration) so a forgotten manual bump can't ship a stale shell silently. Effort: S.
- **F-25 (HIGH)** — reduce per-model timeout in `nim-handler.ts` proportionally to the number of models attempted, or reduce `DEFAULT_MODEL_CYCLE` fallback depth so total worst-case time stays under Vercel's 10s cap with margin for cold start. Effort: S.
- **F-14 (MEDIUM, pulled into B for effort-fit)** — debounce/skip the chat-log save effect for 'thinking'-only transitions (only persist on 'done'/'error' or after a short idle debounce). Effort: S.
- **F-02 (MEDIUM)** — align `gist-client.ts`'s `getToken()` with the localStorage-first pattern used elsewhere. Effort: S.
- **F-15 (MEDIUM)** — add a shared `SCHEMA_VERSION`-style tag to `ChatEntry`/`NoteComments` storage envelopes (wrap the array in `{version, data}`) so future shape changes have a migration seam like `yaml-migrations.ts` already provides for `IdearioYAML`. Effort: M.
- **F-22 (MEDIUM)** — lazy-import `model-registry.ts` behind the Settings tab / `ModelSelector` using dynamic `import()`, keeping it out of the initial bundle. Effort: M.

### Stage C — Production Grade
Entry: Stage B exit criteria met. Exit: CI green on every PR, docs match the 6-tab reality, minimal test suite covers the pure libs.

- **Test suite (F-26)** — minimum high-value set, in priority order:
  1. `wake-router.ts` (`routePrompt`) — pure function, wake-word matching edge cases (case, punctuation, substring false-positives like "Hey Kimiko").
  2. `reflex.ts` (`tryReflex`) — pattern matches for save/trust/stop/link commands.
  3. `settings-sync.ts` (`collectSettings`/gating logic in `sendSettingsSync`) — verify the WebRTC-rung-only gate never fires over mailbox.
  4. `providers/*.ts` — mock `fetch`, verify error-message mapping (401, timeout, network) per provider.
  5. `chat-engine.ts` (`buildHistoryMessages`, `dispatchToAgents`) — history windowing and parallel dispatch/error isolation.
  - CI workflow: GitHub Actions running `npm ci && npx tsc -b && npm run lint && npm test && npm run build` on every PR to `main`; block merge on failure.
- **Release/versioning** — tag builds with a `VITE_BUILD_ID` (git SHA or semver), surface it in the Debug Overlay, and use it to drive the SW cache-key fix from F-24.
- **Error reporting** — any future error-reporting integration must NOT transmit BYOK keys, chat content, or the Gist mailbox pairing code; scope reports to error name/stack + non-PII state (rung, role, provider id) only — write this as an explicit constraint doc alongside the existing invariants.
- **Docs completion (F-27)** — expand root `README.md` to reflect the 6-tab shell, BYOK setup for all three providers, and link out to `DOCS/BRIDGE.md`/`DOCS/PROVIDERS.md` rather than leaving them undiscoverable.
- **Dead code removal (F-17)** — delete `VoicePanel.tsx`, `ArioOrb.tsx`, `TextInputFallback.tsx` (467 lines) once confirmed zero external references remain (this audit already confirms zero in-repo imports); low risk, clear win for maintenance surface.

### Stage D — Product Expansion
Entry: Stage C exit criteria met. Each item earns its place only with the justification below.

- **Comment sync across bridge (relates F-15/note-comments)** — currently `ideario-note-comments` is device-local only; syncing it hub↔display would let a driver's spoken commentary on a saved idea (captured via voice while driving) appear on the phone hub for later editing without re-typing. Justification: closes a real drop-off point (comments captured in-car are currently stranded on the display device only). Effort: M. Risk: extends the bridge envelope surface, inherits F-01/F-09's mailbox trust issues until Stage B lands.
- **Idea↔chat linkage** — let a saved idea's card deep-link back into the chat thread it was captured from (currently `buildSavedIdearioFromExchange` captures a snapshot but severs the link). Justification: a driver reviewing saved ideas later often wants the full conversational context, not just the summary. Effort: M.
- **Model management UI polish** — beyond `ModelSelector`'s current flat list, group/filter the 790-line `model-registry.ts` by capability/cost once F-22's lazy-load lands, so drivers configuring a new agent aren't scrolling a huge flat list. Justification: reduces interaction depth for a settings task that should be rare but shouldn't be painful when it happens. Effort: S–M, low urgency (Settings tab is not driving-time critical).

---

## 6. Swarm Decomposition Sketch (Stage B)

Proposed 2-coder split with disjoint file ownership and frozen contracts.

**Coder A — Bridge & Security hardening**
Owns: `src/lib/bridge/session.ts`, `src/lib/bridge/mailbox.ts`, `src/lib/bridge/types.ts`, `src/lib/settings-sync.ts`, `src/lib/gist-client.ts`, `src/lib/gist-index.ts`, `vercel.json` (headers section only).
Covers: F-01, F-02, F-08, F-09, F-24 (SW cache-key coordination touches `public/sw.js` too — see frozen contract below).

**Coder B — Chat/Voice UX & Performance**
Owns: `src/components/ChatPanel.tsx`, `src/components/ChatBubble.tsx`, `src/hooks/useWakeWord.ts`, `src/hooks/useSpeechRecognition.ts`, `src/lib/chat-engine.ts`, `src/lib/crew-audio.ts`, `api/nim-handler.ts`.
Covers: F-04 (link-button gating lives in ChatBubble/ChatPanel), F-11, F-13, F-14, F-19 (the rendering-side half), F-25.

**Frozen contracts (must not change without cross-review):**
1. `BridgeEnvelope` shape (`bridge/types.ts`) — Coder A owns it; Coder B's `ChatPanel.tsx` consumes `'entries'`/`'chat-input'`/`'state'` envelope types and must not be broken silently.
2. `ChatEntry` shape (`chat-engine.ts`) — Coder B owns it; Coder A's settings-sync system-entry injection (`App.tsx`/`ChatPanel.tsx` boundary, F-07's cleanup) depends on the exact fields (`role`, `status`, `ts`).
3. `public/sw.js` cache-key strategy (F-24) — Coder A proposes the build-id injection mechanism; Coder B does not touch `sw.js` but must confirm no client code assumes the literal `-v4` cache name strings.
4. CSP header value (F-04) — Coder A drafts based on the full set of external origins each provider hits; Coder B must report every external `fetch`/`speechSynthesis`/`RTCPeerConnection` origin used in owned files so the policy isn't drafted blind.

Neither coder touches `src/App.tsx` without the other's sign-off — it is the one shared integration point (owns the settings-sync listener AND the voice-to-chat send-ref wiring) and is explicitly excluded from either owner's exclusive list for this stage.

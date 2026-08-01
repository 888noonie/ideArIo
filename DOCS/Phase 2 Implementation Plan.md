# Ideario — Phase 2 Implementation Plan

**Goal:** Transform Ideario from an idea capture tool into an idea execution platform that works reliably on the Hyundai Tucson 2026 touchscreen, can be iterated locally, and begins building real artifacts from voice-captured ideas.

**Target outcomes**
- Full voice → YAML → save → build flow works on `npm run dev`
- "Hey Ario" hands-free wake word and "Build it" commands can be enabled
- Manual text fallback for when voice fails in the car
- Theme engine supports Neon Turquoise + Light Edition
- Idea Tree is interactive and scales across 8:3 resolutions
- Offline PWA shell caching via service worker
- **The Forge**: Tap-to-build or voice-command artifact generation from YAML nodes

---

## 🏗️ NEW: Sprint 2.0 — The Forge (Artifact Builder)

**Problem:** Ideario captures and visualizes ideas, but doesn't help you build them. The magic is making the YAML seed grow into a real artifact.

**Solution:** Add a "Build" action to each Idea Tree node. Tapping or saying "Hey Ario, build it" sends the YAML context to a strong NVIDIA coding/reasoning model, which returns a concrete artifact (code, document, 3D scene description, etc.). The artifact is rendered in a preview pane and saved to the same Gist as the YAML.

**The Forge Workflow**
1. **Seed**: Speak idea → YAML → Idea Tree renders
2. **Command**: Tap "Build" on a node, or say "Hey Ario, build [node name]"
3. **Forge**: Ario sends the node + full YAML context to the LLM with a build prompt
4. **Artifact**: LLM returns a structured artifact (React component, HTML mockup, Three.js scene, markdown doc, etc.)
5. **Preview**: Artifact renders in a safe sandbox on the right panel
6. **Vault**: Artifact code is saved to the Gist alongside the YAML

**Files to change/create**
- `src/components/ForgePanel.tsx` — artifact preview + build controls
- `src/components/BuildButton.tsx` — tap-to-build action on nodes
- `src/lib/forge-client.ts` — prompt builder + artifact parser
- `src/lib/artifact-sandbox.tsx` — safe preview renderer
- `src/types/ideario.ts` — add `artifact` and `artifact_type` fields
- `api/nim-proxy.ts` — add `/api/nim-forge` endpoint (or reuse with `mode: 'forge'`)
- `src/App.tsx` — manage Forge state and voice command routing

**Artifact types for MVP**
- `code`: React/JS component scaffold
- `html`: Static HTML/CSS mockup
- `markdown`: Structured document or plan
- `3d-scene`: Three.js/React Three Fiber scene description
- `diagram`: Mermaid/SVG diagram

**Sandboxing approach (car-safe)**
- Use `<iframe srcDoc>` for HTML/CSS artifacts (isolated, no external scripts)
- Use React component parser for simple JSX components (Babel standalone or `htm`)
- Never execute arbitrary scripts on the main thread
- Sandbox preview has its own theme-neutral styling so it doesn't clash with Ario's UI

**Acceptance criteria**
- Tap a node → "Build" → artifact appears in preview panel
- "Hey Ario, build the core idea" triggers the same flow via voice
- Artifact is saved to the same Gist as the YAML
- Preview sandbox cannot break the main app
- Build state shows "Forging..." with Ario TTS feedback

**Suggested LLM models for Forge**
- `deepseek-ai/deepseek-v4-pro` — best for complex code artifacts
- `meta/llama-3.1-70b-instruct` — strong structured output
- `mistralai/mistral-large-2-instruct` — good for documents and plans
- `deepseek-ai/deepseek-coder-6.7b-instruct` — specialized for code

---

## Sprint 2.1: Local Dev End-to-End (Highest Priority)

**Problem:** `/api/nim-proxy` only works on Vercel, so the full flow can't be tested locally.

**Solution:** Add a local Vite plugin/Express-style middleware that handles `/api/nim-proxy` in dev.

**Files to change/create**
- `vite.config.ts` — add `server.proxy` or custom middleware
- `src/lib/nim-mock.ts` — optional mock response for offline demos
- `api/nim-proxy.ts` — keep as production target

**Acceptance criteria**
- `npm run dev` → tap Ario → speak → see YAML nodes render
- No 502 errors in console during local development
- Add `VITE_USE_MOCK_NIM=true` flag to test without an NVIDIA key

---

## Sprint 2.2: "Hey Ario" Wake Word + Command Grammar

**Problem:** Current flow requires tapping the orb before speaking, which is not hands-free. Forge commands also need voice support.

**Solution:** Add a toggle for continuous listening mode that listens for the wake phrase "Hey Ario" (or "Ario"), then captures the following sentence. Extend the grammar to recognize "build" commands.

**Files to change/create**
- `src/hooks/useSpeechRecognition.ts` — support `continuous: true` and wake-word detection
- `src/hooks/useWakeWord.ts` — new hook for wake-word logic
- `src/lib/voice-commands.ts` — parse "Hey Ario, build it" / "Hey Ario, build [node]"
- `src/components/ArioOrb.tsx` — indicate "wake mode" state
- `src/App.tsx` — manage wake mode and command routing

**Command grammar for MVP**
- `Hey Ario` → wake
- `Hey Ario, build it` → build the current idea
- `Hey Ario, build [node name]` → build a specific node
- `Hey Ario, switch to light theme` → theme change (Phase 2 stretch)

**Acceptance criteria**
- User can enable "Hey Ario" mode
- In wake mode, Ario listens continuously but only processes after hearing "Hey Ario"
- "Build it" commands route to The Forge
- Battery/CPU usage is reasonable (pause after 30s of silence)

---

## Sprint 2.3: Manual Text Input Fallback

**Problem:** If Web Speech API fails in the car browser, the app is unusable.

**Solution:** Add a large, car-safe text input fallback accessible from the voice panel.

**Files to change/create**
- `src/components/TextInputFallback.tsx` — full-width text area + submit button
- `src/components/VoicePanel.tsx` — add "Type instead" toggle
- `src/App.tsx` — route typed input through the same YAML pipeline

**Acceptance criteria**
- User can switch from voice to text input with one tap
- Typed ideas are processed through NVIDIA NIM and rendered identically to voice ideas
- Large touch targets and high contrast

---

## Sprint 2.4: Theme Engine + Light Edition

**Problem:** Only one theme exists; daytime driving needs a polished light version.

**Solution:** Implement theme switching via `data-theme` attribute and CSS variables. Add Light Edition theme.

**Files to change/create**
- `src/styles/themes.css` — extract all theme variables here
- `src/themes/ario-signature.ts` — neon turquoise theme object
- `src/themes/light-edition.ts` — light theme object
- `src/components/ThemeSwitcher.tsx` — quick toggle in status bar
- `src/App.tsx` — apply theme attribute to `<html>`

**Acceptance criteria**
- Two themes: Neon Turquoise (default) and Light Edition
- Theme switch is instant and persists in localStorage
- Voice command "Ario, switch to light theme" works (Phase 2 stretch)

---

## Sprint 2.5: Interactive Idea Tree + Forge Integration

**Problem:** Node graph is read-only. To support The Forge, nodes need to be tappable and build actions need to be visible.

**Solution:** Make nodes tappable/expandable, add a "Build" action per node, and scale the canvas across resolutions.

**Files to change/create**
- `src/components/IdeaCanvas.tsx` — add tap-to-expand, drag-to-pan, pinch-to-zoom
- `src/lib/layout-engine.ts` — extract layout logic, support force-directed positioning
- `src/components/NodeDetail.tsx` — modal/card showing full node info + Build button
- `src/components/BuildButton.tsx` — floating action button or node-context build trigger

**Acceptance criteria**
- Tap a node to see its details and Build button
- Graph recentres when canvas resizes
- Nodes don't overlap at 1280×480, 1920×720, or 2560×960
- Build action connects to The Forge

---

## Sprint 2.6: PWA Service Worker + Offline Shell

**Problem:** App shell is not cached; reload in a tunnel shows a blank page.

**Solution:** Add a service worker that caches the app shell and assets.

**Files to change/create**
- `public/sw.js` — service worker with cache-first strategy
- `src/main.tsx` — register service worker
- `vite.config.ts` — ensure service worker is copied to dist

**Acceptance criteria**
- App loads offline after first visit
- CachedIdeas from IndexedDB display when offline
- Background sync queues Gist saves when connection returns

---

## Sprint 2.7: Gist Vault Index + Artifact Storage

**Problem:** Loading all ideas requires paginating through every Gist; artifacts need a clean way to live alongside YAML.

**Solution:** Maintain a single "ideario-index" Gist that lists all idea Gist IDs. Store artifacts as additional files in the same Gist.

**Files to change/create**
- `src/lib/gist-index.ts` — read/write index Gist
- `src/lib/gist-client.ts` — use index for loading, update index on save
- `src/lib/artifact-storage.ts` — save/load artifact files in Gist

**Gist structure per Ideario**
- `[idea-title].yaml` — the structured idea
- `[idea-title].artifact.html` — generated HTML artifact
- `[idea-title].artifact.jsx` — generated React artifact
- `metadata.json` — idea metadata + artifact references

**Acceptance criteria**
- Save creates idea Gist + updates index Gist
- Load reads index first, then fetches listed idea Gists
- Artifacts are saved and loaded alongside YAML
- Gracefully falls back to full Gist list if index is missing

---

## Sprint 2.8: YAML Schema Refinement (Forge-Ready)

**Problem:** Schema needs to support artifacts, transcripts, and future context.

**Solution:** Extend the schema while keeping backward compatibility.

**New fields to add**
- `transcript`: original spoken text
- `context`: location, time, vehicle data placeholders
- `artifacts`: array of generated artifact references (type, filename, gist_file)
- `version`: schema version string

**Files to change/create**
- `src/types/ideario.ts` — update interfaces
- `src/lib/yaml-builder.ts` — update prompt and parser
- `src/lib/yaml-migrations.ts` — handle older saved ideas

**Acceptance criteria**
- New ideas include `transcript`, `context`, `artifacts`, and `version`
- Old saved ideas still load and render
- Forge artifacts are recorded in the `artifacts` array

---

## Sprint 2.9: Car Hardware Validation

**Problem:** We haven't tested on the actual Tucson touchscreen.

**Solution:** Define a testing checklist and add a debug overlay for resolution/touch target verification.

**Files to change/create**
- `src/components/DebugOverlay.tsx` — show current resolution, touch target sizes, ratio
- `DOCS/Tucson Testing Checklist.md` — step-by-step testing guide

**Acceptance criteria**
- Debug overlay can be toggled in settings
- Touch targets measure ≥ 72×72px at current resolution
- App renders correctly at 1280×480, 1920×720, and 2560×960
- The Forge preview renders without breaking the 8:3 layout

---

## Recommended Order of Attack

1. **Local dev end-to-end** — unblocks all other iteration
2. **Manual text fallback** — safety net for tomorrow's demo
3. **The Forge (MVP)** — the "wow" feature; build one artifact type (HTML or code) end-to-end
4. **Interactive Idea Tree** — tap nodes → Build button → Forge
5. **Theme engine + Light Edition** — quick win for daytime driving
6. **"Hey Ario" wake word + command grammar** — hands-free safety + "Build it" voice
7. **PWA service worker** — offline resilience
8. **Gist index + artifact storage** — scale prep
9. **YAML schema refinement** — Forge-ready data model
10. **Car hardware validation** — final verification

---

## Deployment Notes for Phase 2

- Continue using Vercel for production deploys
- Add `NVIDIA_API_KEY`; if Gist backup is needed, add server-only `GITHUB_TOKEN`,
  `IDEARIO_GIST_SYNC_ENABLED=true`, and `VITE_GIST_SYNC_ENABLED=true` in Vercel
- Consider adding `VERCEL_*` analytics only after core features are stable
- The Forge may benefit from a stronger model; default to `deepseek-ai/deepseek-v4-pro` and let the user override via the model selector

---

## Definition of Done for Phase 2

- [ ] `npm run dev` runs the full voice → YAML → save flow without 502 errors
- [ ] Manual text fallback works
- [ ] Light Edition theme is usable
- [ ] Idea Tree is tappable and resolution-aware
- [ ] Tap-to-build works for at least one artifact type (HTML or code)
- [ ] "Hey Ario, build it" voice command works
- [ ] App loads offline after first visit
- [ ] Artifacts are saved to and loaded from GitHub Gist
- [ ] Tested on at least one 8:3 resolution between 1280×480 and 2560×960

---

*Prepared for Richard and the Ideario team — GLM, DeepSeek, Kimi.*

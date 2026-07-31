# Ideario — Phase 2 Implementation Plan

**Goal:** Harden the MVP into a reliable, car-safe demo that works on the Hyundai Tucson 2026 touchscreen and can be iterated locally without constant Vercel deploys.

**Target outcomes**
- Full voice → YAML → save flow works on `npm run dev`
- "Hey Ario" hands-free wake word can be enabled
- Manual text fallback for when voice fails in the car
- Theme engine supports Neon Turquoise + Light Edition
- Node graph is interactive and scales across 8:3 resolutions
- Offline PWA shell caching via service worker

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

## Sprint 2.2: "Hey Ario" Wake Word

**Problem:** Current flow requires tapping the orb before speaking, which is not hands-free.

**Solution:** Add a toggle for continuous listening mode that listens for the wake phrase "Hey Ario" (or "Ario"), then captures the following sentence.

**Files to change/create**
- `src/hooks/useSpeechRecognition.ts` — support `continuous: true` and wake-word detection
- `src/hooks/useWakeWord.ts` — new hook for wake-word logic
- `src/components/ArioOrb.tsx` — indicate "wake mode" state
- `src/App.tsx` — manage wake mode toggle

**Acceptance criteria**
- User can enable "Hey Ario" mode
- In wake mode, Ario listens continuously but only processes after hearing "Hey Ario"
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

## Sprint 2.5: Interactive Node Graph

**Problem:** Node graph is read-only and doesn't scale across different 8:3 resolutions.

**Solution:** Make nodes tappable/expandable and add a resolution-aware canvas.

**Files to change/create**
- `src/components/IdeaCanvas.tsx` — add tap-to-expand, drag-to-pan, pinch-to-zoom
- `src/lib/layout-engine.ts` — extract layout logic, support force-directed positioning
- `src/components/NodeDetail.tsx` — modal/card showing full node info

**Acceptance criteria**
- Tap a node to see its details
- Graph recentres when canvas resizes
- Nodes don't overlap at 1280×480, 1920×720, or 2560×960

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

## Sprint 2.7: Gist Vault Index

**Problem:** Loading all ideas requires paginating through every Gist; doesn't scale.

**Solution:** Maintain a single "ideario-index" Gist that lists all idea Gist IDs.

**Files to change/create**
- `src/lib/gist-index.ts` — read/write index Gist
- `src/lib/gist-client.ts` — use index for loading, update index on save

**Acceptance criteria**
- Save creates idea Gist + updates index Gist
- Load reads index first, then fetches listed idea Gists
- Gracefully falls back to full Gist list if index is missing

---

## Sprint 2.8: YAML Schema Refinement

**Problem:** Schema is minimal; future features (transcript, context, artifacts) need a place.

**Solution:** Extend the schema while keeping backward compatibility.

**New fields to add**
- `transcript`: original spoken text
- `context`: location, time, vehicle data placeholders
- `artifacts`: array of external asset references (3D models, images)
- `version`: schema version string

**Files to change/create**
- `src/types/ideario.ts` — update interfaces
- `src/lib/yaml-builder.ts` — update prompt and parser
- `src/lib/yaml-migrations.ts` — handle older saved ideas

**Acceptance criteria**
- New ideas include `transcript`, `context`, `artifacts`, and `version`
- Old saved ideas still load and render

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

---

## Recommended Order of Attack

1. **Local dev end-to-end** — unblocks all other iteration
2. **Manual text fallback** — safety net for tomorrow's demo
3. **Theme engine + Light Edition** — quick win for daytime driving
4. **Interactive node graph** — makes the visualizer feel alive
5. **"Hey Ario" wake word** — hands-free safety feature
6. **PWA service worker** — offline resilience
7. **Gist index + schema refinement** — scale prep
8. **Car hardware validation** — final verification

---

## Deployment Notes for Phase 2

- Continue using Vercel for production deploys
- Add `NVIDIA_API_KEY` and `VITE_GITHUB_TOKEN` in Vercel dashboard before testing
- Consider adding `VERCEL_*` analytics only after core features are stable

---

## Definition of Done for Phase 2

- [ ] `npm run dev` runs the full voice → YAML → save flow without 502 errors
- [ ] Manual text fallback works
- [ ] Light Edition theme is usable
- [ ] Node graph is tappable and resolution-aware
- [ ] App loads offline after first visit
- [ ] "Hey Ario" wake mode can be toggled on/off
- [ ] Tested on at least one 8:3 resolution between 1280×480 and 2560×960

---

*Prepared for Richard and the Ideario team — GLM, DeepSeek, Kimi.*

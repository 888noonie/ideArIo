# Tucson Touchscreen Testing Checklist

Target hardware: Hyundai Tucson 2026 center display (8:3 aspect ratio).
Test at each supported resolution before demoing in the car.

## 0. Setup

- [ ] App deployed to Vercel (or `npm run dev` on same network) with
      `NVIDIA_API_KEY` and `VITE_GITHUB_TOKEN` configured
- [ ] Open the app in the car browser (Android Chrome / in-dash Chromium)
- [ ] Toggle the **debug overlay** (wrench icon in the status bar)

## 1. Resolution & Layout (run at 1280×480, 1920×720, 2560×960)

- [ ] Debug overlay reports an 8:3 aspect ratio (± rounding)
- [ ] Voice panel (left 30%) and idea canvas (right 70%) both fully visible,
      no clipped panels, no scrollbars on the outer page
- [ ] Node graph is centred; core node is in the middle of the canvas
- [ ] No overlapping nodes (labels readable) at each resolution
- [ ] Resizing/rotating the window recentres the graph
- [ ] Debug overlay touch-target check reports **all targets ≥ 72×72px**

## 2. Voice Capture

- [ ] Tap the orb → orb shows "Listening..." → speak an idea → transcript appears
- [ ] Stay silent after tapping → within ~7 seconds Ario says
      "I didn't hear anything — tap and try again, or use Type instead"
      and the orb returns to idle (never stuck on "Listening...")
- [ ] Deny mic permission → friendly error, app stays usable via "Type instead"
- [ ] With the screen locked/unlocked or engine start/stop, tapping the orb
      still starts a fresh listening session

## 3. "Hey Ario" Wake Mode

- [ ] Toggle "Hey Ario" ON → orb shows "Say 'Hey Ario'"
- [ ] Say "Hey Ario, <idea>" → idea is processed and graphed, then Ario
      returns to wake listening
- [ ] Say a bare "Ario" then the idea within ~4s → still captured
- [ ] Leave it silent for 30s → wake mode auto-pauses; tap orb to resume
- [ ] Toggle OFF → all recognition stops

## 4. Text Fallback

- [ ] "Type instead" opens the large text area; on-screen keyboard usable
- [ ] Submitted text produces the same YAML graph + save flow as voice
- [ ] "Back to Voice" returns to the orb
- [ ] On a browser without the Web Speech API, text mode opens automatically

## 5. Idea Canvas

- [ ] Tap a node → NodeDetail modal opens with type, connections; Close works
- [ ] Drag the canvas → graph pans; tap still works after panning
- [ ] "Save Idea" persists; idea count in the status bar increments

## 6. Themes

- [ ] Theme toggle in the status bar switches Neon Turquoise ↔ Light Edition
- [ ] Light Edition: text readable in bright daylight (contrast check)
- [ ] Theme persists across reloads

## 7. Offline / PWA

- [ ] Load the app once online, then go offline (tunnel mode / airplane mode)
      and reload → app shell still loads from the service worker cache
- [ ] Offline: captured ideas save to IndexedDB ("Offline — saved locally")
- [ ] Back online → pending ideas sync to Gist automatically
- [ ] `/api/*` calls are never served from cache

## 8. Safety

- [ ] All primary actions reachable with one tap, targets ≥ 72px
- [ ] No interaction requires reading small text while driving
- [ ] Voice prompts are short and non-blocking

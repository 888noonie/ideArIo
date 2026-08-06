# ideArIo

A voice-first, in-car AI companion PWA. React 19 + TypeScript + Vite + Tailwind, deployed on Vercel with a serverless NIM proxy. Bring your own keys — everything sensitive stays in your browser.

## The shell

An always-on chat panel plus six tabs:

- **Voice Chat** — hands-free conversation with wake word and spoken replies
- **Ideas** — the live IdeaCanvas for the current ideario, plus saved ideas as collapsible notes with inline comments
- **Agents** — create and edit the agent crew (names, colors, personas, wake words)
- **Bridge** — pair two devices (phone + car head unit) over a Gist mailbox with WebRTC upgrade; syncs settings and queues links
- **History** — browse past idearios
- **Settings** — providers, models, GitHub Gist token, theme

## BYOK — bring your own keys

Provider keys are entered in **Settings** and stored ONLY in browser `localStorage` (`ideario-key-*`). They are never committed, never sent anywhere except the matching provider endpoint, and during Bridge settings sync they travel only over the WebRTC rung — never through the Gist mailbox.

Six providers are supported:

1. **NVIDIA NIM** — server-side key: set `NVIDIA_API_KEY` in Vercel → Settings → Environment Variables (all environments), then redeploy. The app calls the serverless `/api/nim-proxy`; the key never reaches the browser bundle.
2. **OpenRouter** — key entered in Settings, stored in `localStorage`, called directly from the browser.
3. **Groq** — key entered in Settings, stored in `localStorage`, called directly from the browser.
4. **Google Gemini** — key entered in Settings, stored in `localStorage`, called directly from the browser.
5. **OfoxAI** — key entered in Settings, stored in `localStorage`, called directly from the browser.
6. **Ollama** — choose Local mode for offline models (default `http://localhost:11434`) or Ollama Cloud mode with a BYOK key. Use Fetch models in the agent editor to list the selected endpoint's live catalogue.

Optional: a GitHub token may be entered in Settings for Gist sync. The app stores it only in this browser and never bundles it. Bridge pairing now uses a server-side relay (`BRIDGE_GITHUB_TOKEN` in Vercel), so the car display does not need a Gist token to pair.

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build
npm run lint     # oxlint
```

## Docs

- [DOCS/BRIDGE.md](DOCS/BRIDGE.md) — pairing protocol, mailbox/WebRTC rungs, security invariants
- [DOCS/PROVIDERS.md](DOCS/PROVIDERS.md) — provider architecture and model registry

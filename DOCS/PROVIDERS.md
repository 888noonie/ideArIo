# ideArIo Providers — BYOK Setup Guide

ideArIo chat agents run against three providers. Keys live **only in your
browser's localStorage** (or server-side env vars for NIM) and are sent only
to the matching provider endpoint. Nothing is committed or proxied anywhere
else.

## 1. OpenRouter (cloud, bring your own key)

Used by the built-in **Kimi** and **DeepSeek** agents.

1. Create a key at <https://openrouter.ai/keys>.
2. In ideArIo, open the **Settings** tab and paste it into the
   **OpenRouter API key** field (stored as `ideario-key-openrouter` in
   localStorage — never leaves your device except to `openrouter.ai`).
3. Requests go browser-direct to
   `https://openrouter.ai/api/v1/chat/completions` with your key as a Bearer
   token. A 401 response means the key is wrong or revoked — check it in
   Settings.
4. Default model: `moonshotai/kimi-k2`. Use **Fetch models** in the agent
   editor to list everything your account can access (no key required for the
   model list).

## 2. Ollama (local, no key)

Used by the built-in **Ario Local** agent — fully offline fallback.

1. Install and run Ollama (<https://ollama.com>), then pull a model, e.g.
   `ollama pull llama3.1:8b`.
2. Browsers block cross-origin calls to `localhost` unless Ollama allows them.
   Start Ollama with your app's origin (or `*` for local dev):

   ```bash
   OLLAMA_ORIGINS=* ollama serve
   ```

3. In **Settings**, set the **Ollama base URL** if it differs from the default
   `http://localhost:11434` (stored as `ideario-ollama-url`).
4. Chat calls go to `{base}/v1/chat/completions` (OpenAI-compatible); the
   model list comes from `{base}/api/tags`.
5. If you see "Could not connect to Ollama", the server is down or
   `OLLAMA_ORIGINS` is missing your origin.

## 3. NVIDIA NIM (legacy, server-side key)

The original ideArIo backend. The browser **never** sees this key.

1. Get a key at <https://build.nvidia.com>.
2. In Vercel: Project → Settings → Environment Variables → add
   `NVIDIA_API_KEY` (Production **and** Preview), then redeploy.
3. All calls go through the `/api/nim-proxy` serverless function, which also
   cycles a fallback model list if the requested model fails. A
   "NVIDIA_API_KEY not configured" error means step 2 is incomplete.

## Troubleshooting

| Symptom | Likely fix |
| --- | --- |
| 401 from OpenRouter | Re-check the key in Settings (`openrouter.ai/keys`) |
| "Could not connect to Ollama" | Start with `OLLAMA_ORIGINS=* ollama serve` |
| Empty Ollama response | Pull the model: `ollama pull <model>` |
| "NVIDIA_API_KEY not configured" | Add env var in Vercel, redeploy |
| 30s timeouts | Provider overloaded — retry or switch model/agent |

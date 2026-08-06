# ideArIo Providers — BYOK Setup Guide

ideArIo chat agents run against six providers. Keys live **only in your
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

## 2. Ollama (local or cloud, bring your own key for cloud)

Used by the built-in **Ario Local** agent — fully offline when Local mode is selected.

1. For Local mode, install and run Ollama (<https://ollama.com>), then pull a model, e.g.
   `ollama pull llama3.1:8b`.
2. Browsers block cross-origin calls to `localhost` unless Ollama allows them.
   Start Ollama with your app's origin (or `*` for local dev):

   ```bash
   OLLAMA_ORIGINS=* ollama serve
   ```

3. In **Settings**, select **Local Ollama** and set the base URL if it differs from the default
   `http://localhost:11434` (stored as `ideario-ollama-url`).
4. For Cloud mode, create an API key at <https://ollama.com/settings/keys>, select
   **Ollama Cloud**, and save the key in Settings. It is stored as
   `ideario-key-ollama` and sent only to `https://ollama.com/api` as a Bearer token.
5. Use **Fetch models** in the agent editor to list models available to the current
   Local or Cloud endpoint. This avoids a stale hard-coded catalogue as Ollama adds
   and retires cloud models.
6. If you see "Could not connect to Ollama", the local server is down or
   `OLLAMA_ORIGINS` is missing your origin.

## 3. NVIDIA NIM (legacy, server-side key)

The original ideArIo backend. The browser **never** sees this key.

1. Get a key at <https://build.nvidia.com>.
2. In Vercel: Project → Settings → Environment Variables → add
   `NVIDIA_API_KEY` (Production **and** Preview), then redeploy.
3. All calls go through the `/api/nim-proxy` serverless function, which also
   cycles a fallback model list if the requested model fails. A
   "NVIDIA_API_KEY not configured" error means step 2 is incomplete.

## 4. Groq (cloud, bring your own key)

1. In ideArIo **Settings**, enter your Groq API key (stored as
   `ideario-key-groq` in localStorage).
2. Groq agents call `https://api.groq.com/openai/v1/chat/completions` with the
   key as a Bearer token. Use **Fetch models** in the agent editor to list the
   models available to the key.

## 5. Google Gemini (cloud, bring your own key)

1. In **Settings**, enter a Gemini API key (stored as `ideario-key-gemini`).
2. Gemini agents call the Google Generative Language API directly from the
   browser. Use **Fetch models** to show models that support text generation.

## 6. OfoxAI (cloud, bring your own key)

1. In **Settings**, enter your OfoxAI API key (stored as `ideario-key-ofox`).
2. OfoxAI uses its OpenAI-compatible endpoint at
   `https://api.ofox.ai/v1/chat/completions`. Use **Fetch models** to list the
   public OfoxAI model catalog.

## Troubleshooting

| Symptom | Likely fix |
| --- | --- |
| 401 from OpenRouter | Re-check the key in Settings (`openrouter.ai/keys`) |
| 401 from Groq, Gemini, or OfoxAI | Re-check that provider's key and model access in Settings |
| "Could not connect to Ollama" | Start with `OLLAMA_ORIGINS=* ollama serve` |
| Empty Local Ollama response | Pull the model: `ollama pull <model>` |
| Ollama Cloud 401 | Re-check the Ollama Cloud key in Settings |
| "NVIDIA_API_KEY not configured" | Add env var in Vercel, redeploy |
| 30s timeouts | Provider overloaded — retry or switch model/agent |

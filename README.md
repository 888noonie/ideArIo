# Ideario

Voice-first idea capture that converts a spoken idea into structured YAML and stores it locally. It can optionally back up ideas to private GitHub Gists.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

`npm run dev` runs the Vite client. To exercise the Vercel serverless APIs locally, use `npx vercel dev` with the same `.env.local` file.

Before pushing, run:

```bash
npm run check
npm audit --omit=dev --audit-level=high
```

## Vercel environment variables

Set `NVIDIA_API_KEY` for idea generation. It must be configured only in Vercel/server environment variables.

Gist backup is disabled by default. To enable it deliberately, set all three values:

```text
GITHUB_TOKEN=...                     # server-only; never use VITE_GITHUB_TOKEN
IDEARIO_GIST_SYNC_ENABLED=true        # server-side safeguard
VITE_GIST_SYNC_ENABLED=true           # public client feature flag, not a secret
```

Use a GitHub token limited to the Gist permission. Optionally set `NVIDIA_ALLOWED_MODELS` to a comma-separated allowlist when deploying a public instance.

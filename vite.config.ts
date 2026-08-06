import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { handleNimProxyRequest, type NimProxyBody } from './api/nim-handler.js'
import { buildMockCompletion } from './src/lib/nim-mock.js'
import { handleRelayDevRequest } from './src/lib/bridge/relay-mock.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/**
 * Local dev middleware for /api/nim-proxy.
 * Mirrors the Vercel serverless function (api/nim-proxy.ts) so the full
 * voice → YAML → save flow works under `npm run dev` with no deploys.
 *
 * - VITE_USE_MOCK_NIM=true forces a mock response (no NVIDIA key needed).
 * - If NVIDIA_API_KEY is missing, the mock is used as a fallback.
 */
function nimProxyDevPlugin(env: Record<string, string>): Plugin {
  const useMock = () =>
    (env.VITE_USE_MOCK_NIM || process.env.VITE_USE_MOCK_NIM) === 'true';
  const apiKey = () => env.NVIDIA_API_KEY || process.env.NVIDIA_API_KEY;

  return {
    name: 'ideario-nim-proxy-dev',
    configureServer(server) {
      server.middlewares.use('/api/nim-proxy', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let raw = '';
        req.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
        });
        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const body = (raw ? JSON.parse(raw) : {}) as NimProxyBody;

            if (useMock() || !apiKey()) {
              if (!useMock()) {
                // eslint-disable-next-line no-console
                console.warn(
                  '[nim-proxy dev] NVIDIA_API_KEY not set — serving mock response. ' +
                  'Set VITE_USE_MOCK_NIM=true to silence this warning.'
                );
              }
              // Small delay so the UI's "thinking" state is visible in demos.
              await new Promise((r) => setTimeout(r, 600));
              res.statusCode = 200;
              res.end(JSON.stringify(buildMockCompletion(body.transcript || 'mock idea', body.model)));
              return;
            }

            const result = await handleNimProxyRequest(body, apiKey());
            res.statusCode = result.status;
            res.end(JSON.stringify(result.body));
          } catch (error) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                error: `Dev nim-proxy failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              })
            );
          }
        });
      });
    },
  };
}

/**
 * Local dev middleware for /api/bridge-relay.
 * Mirrors the Vercel serverless function (api/bridge-relay.ts) using an
 * in-memory store so the full phone ↔ display pairing flow works under
 * `npm run dev` with no server-side GitHub token.
 */
function bridgeRelayDevPlugin(): Plugin {
  return {
    name: 'ideario-bridge-relay-dev',
    configureServer(server) {
      server.middlewares.use('/api/bridge-relay', (req, res) => {
        handleRelayDevRequest(req, res);
      });
    },
  };
}

/**
 * F-24: inject a build ID (git SHA) into the built dist/sw.js so the
 * service-worker cache keys change automatically on every deploy. A forgotten
 * manual cache-version bump can no longer ship a stale shell to installed
 * PWAs. The source public/sw.js keeps the `__BUILD_ID__` placeholder; only
 * the emitted dist/sw.js is rewritten (in closeBundle, after Vite copies the
 * public dir). Falls back to a timestamp when git isn't available.
 */
function swBuildIdPlugin(): Plugin {
  const buildId = (() => {
    try {
      const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
      if (sha) return sha;
    } catch {
      // git unavailable — fall through
    }
    return Date.now().toString(36);
  })();

  return {
    name: 'ideario-sw-build-id',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist');
      const swPath = path.join(outDir, 'sw.js');
      try {
        const source = readFileSync(swPath, 'utf8');
        const replaced = source.replace(/__BUILD_ID__/g, buildId);
        writeFileSync(swPath, replaced);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[sw-build-id] could not inject build id into dist/sw.js:', error);
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Prefix '' loads every var from .env files (including NVIDIA_API_KEY),
  // so the dev middleware can see them. Nothing here is inlined into the
  // client bundle — only VITE_* vars ever reach the browser.
  const env = loadEnv(mode, __dirname, '');

  return {
    plugins: [react(), nimProxyDevPlugin(env), bridgeRelayDevPlugin(), swBuildIdPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})

import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { handleNimProxyRequest, type NimProxyBody } from './api/nim-handler.js'
import { buildMockCompletion } from './src/lib/nim-mock.js'

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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Prefix '' loads every var from .env files (including NVIDIA_API_KEY),
  // so the dev middleware can see them. Nothing here is inlined into the
  // client bundle — only VITE_* vars ever reach the browser.
  const env = loadEnv(mode, __dirname, '');

  return {
    plugins: [react(), nimProxyDevPlugin(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})

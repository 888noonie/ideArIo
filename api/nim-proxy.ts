import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleNimProxyRequest, type NimProxyBody } from './nim-handler.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const result = await handleNimProxyRequest(req.body as NimProxyBody, process.env.NVIDIA_API_KEY);
  return res.status(result.status).json(result.body);
}

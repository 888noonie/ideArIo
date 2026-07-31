import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ProxyBody {
  transcript: string;
  systemPrompt?: string;
  userPrompt?: string;
  model?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'NVIDIA_API_KEY not configured' });
  }

  const { transcript, systemPrompt, userPrompt, model } = req.body as ProxyBody;

  if (!transcript) {
    return res.status(400).json({ error: 'transcript is required' });
  }

  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'meta/llama-3.3-70b-instruct',
        messages: [
          {
            role: 'system',
            content: systemPrompt || 'You are Ario. Convert ideas into concise YAML.',
          },
          {
            role: 'user',
            content: userPrompt || transcript,
          },
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}

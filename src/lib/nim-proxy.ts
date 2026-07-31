import { SYSTEM_PROMPT, buildUserPrompt } from './yaml-builder';

export interface NIMResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export async function generateIdearioFromTranscript(
  transcript: string,
  modelId?: string
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s client timeout

  try {
    const response = await fetch('/api/nim-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transcript,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(transcript),
        model: modelId,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`NIM proxy failed: ${error}`);
    }

    const data = (await response.json()) as NIMResponse;
    return data.choices[0]?.message?.content || '';
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('NIM proxy timed out. Please try again.');
    }
    throw error;
  }
}

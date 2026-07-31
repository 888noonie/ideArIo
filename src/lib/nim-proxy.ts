import { SYSTEM_PROMPT, buildUserPrompt } from './yaml-builder';

export interface NIMResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export async function generateIdearioFromTranscript(transcript: string): Promise<string> {
  const response = await fetch('/api/nim-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transcript,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(transcript),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`NIM proxy failed: ${error}`);
  }

  const data = (await response.json()) as NIMResponse;
  return data.choices[0]?.message?.content || '';
}

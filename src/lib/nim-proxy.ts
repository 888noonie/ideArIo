import { SYSTEM_PROMPT, buildUserPrompt } from './yaml-builder';

export interface NIMResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * Turn a processing failure into a short, speakable reason so the user
 * hears/sees WHY an idea failed (missing server key, model errors, etc.)
 * instead of a generic "could not process".
 */
export function describeProcessingError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  // Server JSON errors arrive as: NIM proxy failed: {"error":"..."}
  const jsonMatch = raw.match(/"error"\s*:\s*"([^"]+)"/);
  const reason = (jsonMatch?.[1] ?? raw).slice(0, 140);

  if (/NVIDIA_API_KEY not configured/i.test(reason)) {
    return 'Setup issue: the NVIDIA API key is missing on the server. In Vercel, add NVIDIA_API_KEY for both Production and Preview, then redeploy.';
  }
  if (/timed out/i.test(reason)) {
    return 'The AI service timed out. Please try again.';
  }
  if (/All AI models failed/i.test(reason)) {
    return `All AI models failed: ${reason.replace(/^All AI models failed\.\s*/i, '')}`;
  }
  if (/Could not parse idea/i.test(reason)) {
    return 'The AI response was unreadable. Please try again — a different model may help.';
  }
  return `I could not process that idea: ${reason}`;
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

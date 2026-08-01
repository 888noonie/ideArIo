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
  const normalizedTranscript = transcript.trim();
  if (!normalizedTranscript) {
    throw new Error('Please describe an idea before submitting.');
  }
  if (normalizedTranscript.length > 4_000) {
    throw new Error('That idea is too long to process in one request.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch('/api/nim-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transcript: normalizedTranscript,
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
    const content = data.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('Idea generation returned an empty response.');
    }
    return content;
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('NIM proxy timed out. Please try again.');
    }
    throw error;
  }
}

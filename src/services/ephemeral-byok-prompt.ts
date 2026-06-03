export type BYOKPromptReason = 'preview' | 'download' | 'decrypt' | 'editor';

export interface EphemeralBYOKPromptRequest {
  fileName?: string;
  reason?: BYOKPromptReason;
  title?: string;
  description?: string;
}

type EphemeralBYOKPromptHandler = (
  request: EphemeralBYOKPromptRequest
) => Promise<string | null>;

let promptHandler: EphemeralBYOKPromptHandler | null = null;

export function registerEphemeralBYOKPromptHandler(
  handler: EphemeralBYOKPromptHandler | null
): () => void {
  promptHandler = handler;

  return () => {
    if (promptHandler === handler) {
      promptHandler = null;
    }
  };
}

export async function requestEphemeralBYOKKey(
  request: EphemeralBYOKPromptRequest = {}
): Promise<string | null> {
  if (!promptHandler) {
    return null;
  }

  return promptHandler(request);
}

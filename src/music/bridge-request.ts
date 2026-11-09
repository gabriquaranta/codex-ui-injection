import type { MusicRequest, MusicResponse } from "./protocol.js";

export async function processMusicRequest(
  request: MusicRequest,
  handleRequest: (request: MusicRequest) => Promise<MusicResponse>,
  dispatchResponse: (response: MusicResponse) => Promise<void>,
): Promise<void> {
  let response: MusicResponse;
  try {
    response = await handleRequest(request);
  } catch (error: unknown) {
    response = {
      requestId: request.requestId,
      ok: false,
      error: error instanceof Error ? error.message : "Music request failed.",
    };
  }

  try {
    await dispatchResponse(response);
  } catch {
    // A disconnect can make the renderer unreachable; the next state poll will retry.
  }
}

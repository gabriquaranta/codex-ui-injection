import { describe, expect, it } from "vitest";
import { processMusicRequest } from "../../src/music/bridge-request.js";
import type { MusicRequest, MusicResponse } from "../../src/music/protocol.js";

describe("Music bridge requests", () => {
  it("does not retry a response when CDP disconnects during a request", async () => {
    const request: MusicRequest = { requestId: "request-1", action: "state" };
    let completeRequest!: (response: MusicResponse) => void;
    let connectionClosed = false;
    let dispatchCount = 0;
    const pending = processMusicRequest(
      request,
      () => new Promise((resolve) => { completeRequest = resolve; }),
      async () => {
        dispatchCount += 1;
        if (connectionClosed) throw new Error("CDP connection closed.");
      },
    );

    connectionClosed = true;
    completeRequest({ requestId: request.requestId, ok: true });

    await expect(pending).resolves.toBeUndefined();
    expect(dispatchCount).toBe(1);
  });
});

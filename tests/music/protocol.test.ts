import { describe, expect, it } from "vitest";
import { parseMusicRequest } from "../../src/music/protocol.js";

describe("parseMusicRequest", () => {
  it("accepts the fixed playback actions and state request", () => {
    for (const action of ["play", "pause", "next", "previous", "state"]) {
      expect(parseMusicRequest(JSON.stringify({ requestId: "request-1", action }))).toEqual({ requestId: "request-1", action });
    }
  });

  it("requires a numeric track id for artwork requests", () => {
    expect(parseMusicRequest(JSON.stringify({ requestId: "request-2", action: "artwork", trackId: "123" }))).toEqual({
      requestId: "request-2",
      action: "artwork",
      trackId: "123",
    });
    expect(parseMusicRequest(JSON.stringify({ requestId: "request-2", action: "artwork", trackId: "../tmp" }))).toBeNull();
  });

  it("rejects arbitrary commands, extra fields, and invalid request ids", () => {
    expect(parseMusicRequest(JSON.stringify({ requestId: "request-3", action: "run", script: "delete everything" }))).toBeNull();
    expect(parseMusicRequest(JSON.stringify({ requestId: "request-3", action: "play", script: "tell application" }))).toBeNull();
    expect(parseMusicRequest(JSON.stringify({ requestId: "../tmp", action: "pause" }))).toBeNull();
    expect(parseMusicRequest("not json")).toBeNull();
    expect(parseMusicRequest(JSON.stringify({ requestId: "request-4", action: "play", padding: "x".repeat(600) }))).toBeNull();
  });
});

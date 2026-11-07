export type MusicAction = "play" | "pause" | "next" | "previous" | "state" | "artwork";

export interface MusicRequest {
  readonly requestId: string;
  readonly action: MusicAction;
  readonly trackId?: string;
}

export interface MusicTrack {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly album: string;
}

export interface MusicState {
  readonly playback: "playing" | "paused" | "stopped" | "unknown";
  readonly track: MusicTrack | null;
}

export interface MusicResponse {
  readonly requestId: string;
  readonly ok: boolean;
  readonly state?: MusicState;
  readonly artworkDataUrl?: string | null;
  readonly trackId?: string;
  readonly error?: string;
}

const actions = new Set<MusicAction>(["play", "pause", "next", "previous", "state", "artwork"]);

/** Validates a small renderer request against the bridge action allowlist. */
export function parseMusicRequest(payload: string): MusicRequest | null {
  if (payload.length > 512) return null;
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const request = value as Record<string, unknown>;
  const keys = Object.keys(request);
  if (keys.some((key) => !["requestId", "action", "trackId"].includes(key))) return null;
  if (typeof request.requestId !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(request.requestId)) return null;
  if (typeof request.action !== "string" || !actions.has(request.action as MusicAction)) return null;
  if (request.action === "artwork") {
    if (keys.length !== 3 || typeof request.trackId !== "string" || !/^\d{1,20}$/.test(request.trackId)) return null;
    return { requestId: request.requestId, action: "artwork", trackId: request.trackId };
  }
  if (keys.length !== 2 || request.trackId !== undefined) return null;
  return { requestId: request.requestId, action: request.action as MusicAction };
}

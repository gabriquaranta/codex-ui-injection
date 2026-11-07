import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { MusicAction, MusicState } from "./protocol.js";

const execFileAsync = promisify(execFile);
const actionScripts: Readonly<Partial<Record<MusicAction, string>>> = {
  play: 'tell application "Music" to play',
  pause: 'tell application "Music" to pause',
  next: 'tell application "Music" to next track',
  previous: 'tell application "Music" to previous track',
};

const stateScript = `
var music = Application("Music");
var playback = music.playerState();
var track = null;
try {
  var current = music.currentTrack();
  track = {
    id: String(current.databaseID()),
    title: String(current.name()),
    artist: String(current.artist()),
    album: String(current.album())
  };
} catch (error) {}
JSON.stringify({ playback: String(playback), track: track });
`;

const artworkScript = `
on run argv
  set imagePath to item 1 of argv
  set expectedTrackId to item 2 of argv
  tell application "Music"
    try
      set currentTrack to current track
      if (database ID of currentTrack as text) is not expectedTrackId then return ""
      if (count of artworks of currentTrack) is 0 then return ""
      set currentArtwork to artwork 1 of currentTrack
      set imageFormat to format of currentArtwork as text
      set imageData to raw data of currentArtwork
    on error errorMessage number errorNumber
      if errorNumber is -1728 then return ""
      error errorMessage number errorNumber
    end try
  end tell
  set imageFile to open for access (POSIX file imagePath) with write permission
  try
    set eof imageFile to 0
    write imageData to imageFile
    close access imageFile
  on error errorMessage number errorNumber
    try
      close access imageFile
    end try
    error errorMessage number errorNumber
  end try
  return imageFormat
end run
`;

/** Runs one fixed AppleScript command for the requested playback action. */
export async function runMusicAction(action: MusicAction): Promise<void> {
  const script = actionScripts[action];
  if (!script) throw new Error("Unsupported Music action.");
  await execFileAsync("/usr/bin/osascript", ["-e", script], { timeout: 5_000, maxBuffer: 1_024 * 1_024 });
}

/** Reads current playback status and the active track from Music.app. */
export async function readMusicState(): Promise<MusicState> {
  const { stdout } = await execFileAsync("/usr/bin/osascript", ["-l", "JavaScript", "-e", stateScript], {
    timeout: 5_000,
    maxBuffer: 1_024 * 1_024,
  });
  const value = JSON.parse(stdout.trim()) as { playback?: string; track?: MusicState["track"] };
  const playback = value.playback === "playing" || value.playback === "paused" || value.playback === "stopped"
    ? value.playback
    : "unknown";
  const track = value.track && typeof value.track.id === "string"
    ? {
        id: value.track.id,
        title: value.track.title,
        artist: value.track.artist,
        album: value.track.album,
      }
    : null;
  return { playback, track };
}

/** Returns artwork only when the requested track is still current. */
export async function readCurrentArtwork(expectedTrackId: string): Promise<string | null> {
  const directory = await mkdtemp(join(tmpdir(), "codex-music-artwork-"));
  const imagePath = join(directory, "artwork");
  try {
    const { stdout } = await execFileAsync("/usr/bin/osascript", ["-e", artworkScript, imagePath, expectedTrackId], {
      timeout: 8_000,
      maxBuffer: 1_024 * 1_024,
    });
    const format = stdout.trim().toLowerCase().replace(/\s+picture$/, "");
    const mimeType = format === "jpeg" || format === "jpg" ? "image/jpeg"
      : format === "png" ? "image/png"
        : format === "gif" ? "image/gif"
          : format === "tiff" ? "image/tiff"
            : null;
    if (!mimeType) return null;
    const bytes = await readFile(imagePath);
    return `data:${mimeType};base64,${bytes.toString("base64")}`;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

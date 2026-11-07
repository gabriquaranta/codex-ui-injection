import { randomUUID } from "node:crypto";
import { closeSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CdpClient } from "../cdp/client.js";
import { CDP_ENDPOINT, discoverTargets, findMainTarget } from "../cdp/discovery.js";
import { isMainCodexTarget } from "../codex/target.js";
import { parseMusicRequest, type MusicRequest, type MusicResponse } from "../music/protocol.js";
import { readCurrentArtwork, readMusicState, runMusicAction } from "../music/player.js";

interface BindingCalledEvent {
  readonly name: string;
  readonly payload: string;
  readonly executionContextId: number;
}

interface ExecutionContextCreatedEvent {
  readonly context?: {
    readonly id?: number;
    readonly auxData?: { readonly frameId?: string; readonly isDefault?: boolean };
  };
}

interface FrameNavigatedEvent {
  readonly frame?: { readonly id?: string; readonly url?: string };
}

async function main(): Promise<void> {
  const lockPath = join(tmpdir(), `codex-music-bridge-${process.getuid?.() ?? "user"}.lock`);
  const lockToken = randomUUID();
  let lockFd: number | undefined;
  for (let attempt = 0; attempt < 20 && lockFd === undefined; attempt += 1) {
    try {
      lockFd = openSync(lockPath, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existingPid = Number(readFileSync(lockPath, "utf8").split(":", 1)[0]);
      if (Number.isInteger(existingPid) && existingPid > 0) {
        try {
          process.kill(existingPid, 0);
          throw new Error("Music bridge is already running.");
        } catch (probeError) {
          if (probeError instanceof Error && probeError.message === "Music bridge is already running.") throw probeError;
          if ((probeError as NodeJS.ErrnoException).code !== "ESRCH") throw probeError;
        }
        rmSync(lockPath, { force: true });
        continue;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  if (lockFd === undefined) throw new Error("Music bridge lock is busy or invalid.");
  writeSync(lockFd, `${process.pid}:${lockToken}`);
  closeSync(lockFd);
  const releaseLock = () => {
    try {
      if (readFileSync(lockPath, "utf8") === `${process.pid}:${lockToken}`) rmSync(lockPath, { force: true });
    } catch { /* The lock is already absent. */ }
  };
  process.once("exit", releaseLock);

  if (new URL(CDP_ENDPOINT).hostname !== "127.0.0.1") throw new Error("The Music bridge requires the localhost CDP endpoint.");
  const targets = await discoverTargets();
  const target = findMainTarget(targets);
  if (!target) throw new Error("Could not select one main app target for the Music bridge.");
  const clientUrl = new URL(target.webSocketDebuggerUrl);
  if (!(isMainCodexTarget(target)
    && ["127.0.0.1", "localhost", "[::1]"].includes(clientUrl.hostname)
    && clientUrl.port === "9335")) {
    throw new Error("Refusing a DevTools WebSocket outside the localhost main app target.");
  }

  const cdp = await CdpClient.connect(clientUrl);
  await cdp.send("Page.enable");
  const frameTree = await cdp.send<{ frameTree: { frame: { id: string; url: string } } }>("Page.getFrameTree");
  const mainFrameId = frameTree.frameTree.frame.id;
  let trustedFrame = isTrustedRendererUrl(frameTree.frameTree.frame.url);
  if (!trustedFrame) throw new Error("The main app frame is not the trusted Codex renderer.");

  let trustedContextId: number | undefined;
  let bindingError: Error | undefined;
  let resolveBinding!: () => void;
  let rejectBinding!: (error: Error) => void;
  const bindingReady = new Promise<void>((resolve, reject) => {
    resolveBinding = resolve;
    rejectBinding = reject;
  });
  const unlistenContext = cdp.onEvent("Runtime.executionContextCreated", (params) => {
    const context = (params as ExecutionContextCreatedEvent | undefined)?.context;
    if (!trustedFrame || !context || context.auxData?.frameId !== mainFrameId || context.auxData.isDefault !== true || !Number.isInteger(context.id)) return;
    const contextId = context.id!;
    void cdp.send("Runtime.addBinding", { name: "__codexMusicBridge", executionContextId: contextId }).then(() => {
      if (!trustedFrame) return;
      trustedContextId = contextId;
      resolveBinding();
    }).catch((error: unknown) => {
      bindingError = error instanceof Error ? error : new Error("Could not bind the trusted renderer context.");
      rejectBinding(bindingError);
    });
  });
  const unlistenDestroyed = cdp.onEvent("Runtime.executionContextDestroyed", (params) => {
    const contextId = (params as { executionContextId?: number } | undefined)?.executionContextId;
    if (contextId === trustedContextId) trustedContextId = undefined;
  });
  const unlistenFrame = cdp.onEvent("Page.frameNavigated", (params) => {
    const frame = (params as FrameNavigatedEvent | undefined)?.frame;
    if (frame?.id !== mainFrameId) return;
    trustedFrame = isTrustedRendererUrl(frame.url ?? "");
    trustedContextId = undefined;
  });
  await cdp.send("Runtime.enable");
  await Promise.race([
    bindingReady,
    new Promise<never>((_, reject) => setTimeout(() => reject(bindingError ?? new Error("Timed out binding the trusted renderer context.")), 5_000)),
  ]);
  let inFlight = 0;
  const unlisten = cdp.onEvent("Runtime.bindingCalled", (params) => {
    const event = params as BindingCalledEvent | undefined;
    process.stdout.write(`Binding context ${event?.executionContextId}; trusted ${trustedContextId}.\n`);
    if (!event || event.name !== "__codexMusicBridge" || event.executionContextId !== trustedContextId || inFlight >= 4) return;
    const request = parseMusicRequest(event.payload);
    if (!request) return;
    inFlight += 1;
    void handleRequest(request).then((response) => dispatchResponse(event.executionContextId, response)).catch((error: unknown) => {
      const response: MusicResponse = {
        requestId: request.requestId,
        ok: false,
        error: error instanceof Error ? error.message : "Music request failed.",
      };
      return dispatchResponse(event.executionContextId, response);
    }).finally(() => {
      inFlight -= 1;
    });
  });
  cdp.onEvent("Inspector.detached", () => cdp.close());
  process.stdout.write(`Music bridge connected to ${target.url}.\n`);

  async function handleRequest(request: MusicRequest): Promise<MusicResponse> {
    if (request.action === "state") {
      return { requestId: request.requestId, ok: true, state: await readMusicState() };
    }
    if (request.action === "artwork") {
      const state = await readMusicState();
      const artworkDataUrl = state.track?.id === request.trackId
        ? await readCurrentArtwork(request.trackId!)
        : null;
      return { requestId: request.requestId, ok: true, trackId: request.trackId, artworkDataUrl };
    }
    await runMusicAction(request.action);
    return { requestId: request.requestId, ok: true, state: await readMusicState() };
  }

  async function dispatchResponse(contextId: number, response: MusicResponse): Promise<void> {
    if (contextId !== trustedContextId) return;
    const encoded = JSON.stringify(JSON.stringify(response));
    const expression = `window.dispatchEvent(new CustomEvent("codex-music-response", { detail: JSON.parse(${encoded}) }))`;
    await cdp.send("Runtime.evaluate", { expression, contextId, returnByValue: true });
  }

  process.once("SIGINT", () => {
    unlisten();
    unlistenContext();
    unlistenDestroyed();
    unlistenFrame();
    cdp.close();
    releaseLock();
  });
  process.once("SIGTERM", () => {
    unlisten();
    unlistenContext();
    unlistenDestroyed();
    unlistenFrame();
    cdp.close();
    releaseLock();
  });
}

function isTrustedRendererUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "app:" && url.hostname === "-" && url.pathname === "/index.html";
  } catch {
    return false;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

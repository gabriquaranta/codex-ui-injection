import { readFile } from "node:fs/promises";
import { CdpClient } from "../cdp/client.js";
import { CDP_ENDPOINT, discoverTargets, findMainTarget } from "../cdp/discovery.js";
import { isMainCodexTarget, type CodexTarget } from "../codex/target.js";

interface RuntimeEvaluation<T> {
  readonly result: { readonly value: T };
  readonly exceptionDetails?: { readonly text: string };
}

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const targetIndex = args.indexOf("--target");
const requestedTargetId = targetIndex >= 0 ? args[targetIndex + 1] : undefined;
const unknownArgs = args.filter((arg, index) => arg !== "--list" && arg !== "--target" && !(index === targetIndex + 1));

function printTargets(targets: readonly CodexTarget[]): void {
  for (const target of targets.filter((item) => item.type === "page")) {
    const marker = isMainCodexTarget(target) ? "[main]" : "      ";
    console.log(`${marker}\t${target.id}\t${target.title || "(untitled)"}\t${target.url}`);
  }
}

async function main(): Promise<void> {
  if (unknownArgs.length || (targetIndex >= 0 && !requestedTargetId)) {
    throw new Error("Usage: node dist/inject.mjs [--list] [--target <target-id>]");
  }

  let targets: CodexTarget[];
  try {
    targets = await discoverTargets();
  } catch (error) {
    throw new Error(`Cannot reach ${CDP_ENDPOINT}. Start ChatGPT with a localhost CDP endpoint.`, { cause: error });
  }
  if (listOnly) {
    printTargets(targets);
    return;
  }

  const target = requestedTargetId
    ? targets.find((item) => item.id === requestedTargetId && isMainCodexTarget(item))
    : findMainTarget(targets);
  if (!target) {
    printTargets(targets);
    throw new Error(requestedTargetId
      ? `Main app target not found: ${requestedTargetId}.`
      : "Could not select one main app target. Use --list, then pass --target <target-id>.");
  }

  const rendererScript = await readFile(new URL("./renderer.js", import.meta.url), "utf8");
  const clientUrl = new URL(target.webSocketDebuggerUrl);
  if (!(["127.0.0.1", "localhost", "[::1]"].includes(clientUrl.hostname) && clientUrl.port === "9335")) {
    throw new Error("Refusing a DevTools WebSocket that does not use localhost port 9335.");
  }

  const cdp = await CdpClient.connect(clientUrl);
  try {
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    const stored = await cdp.send<RuntimeEvaluation<boolean>>("Runtime.evaluate", {
      expression: `(async () => {
        const data = ${JSON.stringify(__CHAT_BACKGROUND__)};
        let image = null;
        if (data !== null) {
          const binary = atob(data.slice(data.indexOf(",") + 1));
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
          image = new Blob([bytes], { type: data.slice(5, data.indexOf(";")) });
        }
        const database = await new Promise((resolve, reject) => {
          const request = indexedDB.open("codex-ui-background", 1);
          request.onupgradeneeded = () => request.result.createObjectStore("images");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise((resolve, reject) => {
          const transaction = database.transaction("images", "readwrite");
          if (image) transaction.objectStore("images").put(image, "chat");
          else transaction.objectStore("images").delete("chat");
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        }).finally(() => database.close());
        return true;
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (stored.exceptionDetails || stored.result.value !== true) {
      throw new Error(`Could not store chat background: ${stored.exceptionDetails?.text ?? "unknown error"}`);
    }
    const installed = await cdp.send<RuntimeEvaluation<string | undefined>>("Runtime.evaluate", {
      expression: "window.__codexUiRuntime?.version",
      returnByValue: true,
    });
    if (installed.result.value !== __BUILD_VERSION__) {
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: rendererScript });
    }
    await cdp.send("Runtime.evaluate", {
      expression: `window.__codexUiForce = true; ${rendererScript}`,
      awaitPromise: true,
    });
    const verification = await cdp.send<RuntimeEvaluation<{
      readonly version?: string;
      readonly toolbarActions: number;
      readonly drawers: number;
    }>>("Runtime.evaluate", {
      expression: `({version: window.__codexUiRuntime?.version, toolbarActions: document.querySelectorAll('[data-codex-ui-action]').length, drawers: document.querySelectorAll('[data-codex-ui-drawer]').length})`,
      returnByValue: true,
    });
    console.log(`Injected ${verification.result.value.version} into ${target.url}: ${JSON.stringify(verification.result.value)}`);
  } finally {
    cdp.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

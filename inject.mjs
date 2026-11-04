import { readFile } from "node:fs/promises";

const endpoint = "http://127.0.0.1:9335";
const targetArgIndex = process.argv.indexOf("--target");
const targetId = targetArgIndex >= 0 ? process.argv[targetArgIndex + 1] : undefined;
const listOnly = process.argv.includes("--list");

async function getTargets() {
  const response = await fetch(`${endpoint}/json/list`);
  if (!response.ok) throw new Error(`CDP returned HTTP ${response.status}`);
  return response.json();
}

let targets;
try {
  targets = await getTargets();
} catch (error) {
  console.error(`Cannot reach ${endpoint}. Start the desktop app with a localhost CDP endpoint first.`);
  console.error(error.message);
  process.exit(1);
}

if (listOnly) {
  const pages = targets.filter(({ type }) => type === "page");
  if (!pages.length) console.log("No page targets found.");
  for (const { id, title, url } of pages) console.log(`${id}\t${title || "(untitled)"}\t${url}`);
  process.exit(0);
}

if (!targetId) {
  console.error("Choose a renderer target first: node inject.mjs --list");
  process.exit(2);
}

const target = targets.find(({ id, type }) => id === targetId && type === "page");
if (!target) {
  console.error(`Page target not found: ${targetId}. Run node inject.mjs --list again.`);
  process.exit(2);
}

const source = await readFile(new URL("./panel.js", import.meta.url), "utf8");
const version = Number(source.match(/^\s*const version = (\d+);/m)?.[1]);
if (!version) throw new Error("Could not read the panel script version.");
const expression = `(()=>{${source}\n})()`;
const socketUrl = new URL(target.webSocketDebuggerUrl);
if (!(["127.0.0.1", "localhost", "[::1]"].includes(socketUrl.hostname) && socketUrl.port === "9335")) {
  console.error("Refusing a DevTools WebSocket that does not use localhost port 9335.");
  process.exit(1);
}
const socket = new WebSocket(socketUrl);
let nextId = 0;
const pending = new Map();

socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  message.error ? reject(new Error(message.error.message)) : resolve(message.result);
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", () => reject(new Error("WebSocket connection failed")), { once: true });
});

await send("Page.enable");
await send("Runtime.enable");
const installedVersion = await send("Runtime.evaluate", {
  expression: "Number(window.__codexSidePanelVersion || 0)",
  returnByValue: true,
});
if (installedVersion.result.value < version) {
  await send("Page.addScriptToEvaluateOnNewDocument", { source: expression });
}
await send("Runtime.evaluate", { expression: `window.__codexSidePanelForce = true; ${expression}`, awaitPromise: true });
const verification = await send("Runtime.evaluate", {
  expression: `(() => {
    const buttons = document.querySelectorAll("#codex-side-poc-button");
    const panels = document.querySelectorAll("#codex-side-poc-panel");
    const activeButtons = [...buttons].filter((item) => item.dataset.pocVersion === "${version}" && getComputedStyle(item).display !== "none");
    const activePanels = [...panels].filter((item) => item.dataset.pocVersion === "${version}");
    const button = buttons[0];
    const panel = activePanels[0];
    const main = [...document.querySelectorAll("main")].find((item) => item.getBoundingClientRect().width > 100);
    const buttonRect = button?.getBoundingClientRect();
    const panelRect = panel?.getBoundingClientRect();
    const mainRect = main?.getBoundingClientRect();
    return {buttonCount: buttons.length, panelCount: panels.length, activeButtonCount: activeButtons.length, activePanelCount: activePanels.length, buttonInToolbar: activeButtons[0]?.parentElement?.className === "contents", panelInLayout: !!panel?.parentElement && getComputedStyle(panel.parentElement).flexDirection === "row", panelOpen: panel?.dataset.open === "true", panelPushesMain: panel?.dataset.open === "true" && mainRect && panelRect.left >= mainRect.right - 1, buttonX: activeButtons[0] && Math.round(activeButtons[0].getBoundingClientRect().x), panelX: panelRect && Math.round(panelRect.x), mainRight: mainRect && Math.round(mainRect.right)};
  })()`,
  returnByValue: true,
});
console.log(`Injected into ${target.url}: ${JSON.stringify(verification.result.value)}`);
socket.close();

socket.addEventListener("close", () => process.exit(0));
process.on("SIGINT", () => socket.close());

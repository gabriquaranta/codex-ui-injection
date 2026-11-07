import { createHash } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { build } from "esbuild";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });

const imageTypes = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
async function readBackground(directory, basename) {
  const backgroundDir = new URL(`../src/modules/${directory}/`, import.meta.url);
  const images = (await readdir(backgroundDir)).filter((name) => new RegExp(`^${basename}\\.(png|jpe?g|webp|gif)$`, "i").test(name));
  if (images.length > 1) throw new Error(`Keep only one ${basename} image in src/modules/${directory}/.`);
  const image = images[0] ? await readFile(new URL(images[0], backgroundDir)) : null;
  const extension = images[0]?.slice(images[0].lastIndexOf(".")).toLowerCase();
  return {
    data: image ? `data:${imageTypes[extension]};base64,${image.toString("base64")}` : null,
    bytes: image,
  };
}
const chatBackground = await readBackground("chat-background", "chat-background");
const workspaceBackground = await readBackground("workspace-background", "workspace-background");
const moduleConfig = await readFile(new URL("../modules.json", import.meta.url));
const hash = createHash("sha256").update(moduleConfig);
if (chatBackground.bytes) hash.update(chatBackground.bytes);
if (workspaceBackground.bytes) hash.update(workspaceBackground.bytes);
const version = `${packageJson.version}+${hash.digest("hex").slice(0, 12)}`;
const define = {
  __BUILD_VERSION__: JSON.stringify(version),
  __CHAT_BACKGROUND__: JSON.stringify(chatBackground.data),
  __WORKSPACE_BACKGROUND__: JSON.stringify(workspaceBackground.data),
};

await Promise.all([
  build({
    entryPoints: [new URL("../src/cli/inject.ts", import.meta.url).pathname],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    outfile: new URL("../dist/inject.mjs", import.meta.url).pathname,
    define,
  }),
  build({
    entryPoints: [new URL("../src/cli/music-bridge.ts", import.meta.url).pathname],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    outfile: new URL("../dist/music-bridge.mjs", import.meta.url).pathname,
  }),
  build({
    entryPoints: [new URL("../src/entrypoints/renderer.ts", import.meta.url).pathname],
    bundle: true,
    platform: "browser",
    target: "chrome120",
    format: "iife",
    outfile: new URL("../dist/renderer.js", import.meta.url).pathname,
    define,
  }),
]);

console.log(`Built version ${version} to dist/.`);

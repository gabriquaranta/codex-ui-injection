import { createHash } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { build } from "esbuild";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });

const imageTypes = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
const images = (await readdir(new URL("../", import.meta.url))).filter((name) => /^chat-background\.(png|jpe?g|webp|gif)$/i.test(name));
if (images.length > 1) throw new Error("Keep only one chat-background image in the repository root.");
const image = images[0] ? await readFile(new URL(`../${images[0]}`, import.meta.url)) : null;
const extension = images[0]?.slice(images[0].lastIndexOf(".")).toLowerCase();
const background = image ? `data:${imageTypes[extension]};base64,${image.toString("base64")}` : null;
const version = image ? `${packageJson.version}+${createHash("sha256").update(image).digest("hex").slice(0, 12)}` : packageJson.version;
const define = { __BUILD_VERSION__: JSON.stringify(version), __CHAT_BACKGROUND__: JSON.stringify(background) };

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

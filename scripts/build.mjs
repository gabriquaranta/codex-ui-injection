import { mkdir, readFile } from "node:fs/promises";
import { build } from "esbuild";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });

const define = { __BUILD_VERSION__: JSON.stringify(packageJson.version) };

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

console.log(`Built version ${packageJson.version} to dist/.`);

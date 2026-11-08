// Bundle the worker (and the @ytc/core TypeScript it uses) into one JS file, so
// production runs plain `node` instead of compiling TypeScript at startup.
// npm packages stay external and load from node_modules as usual.
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const deps = (p) => Object.keys(JSON.parse(readFileSync(new URL(p, import.meta.url))).dependencies ?? {});
const external = [
  ...deps("../../packages/core/package.json"),
  ...deps("../ingest/package.json"),
  ".prisma/client",
].filter((d) => !d.startsWith("@ytc/"));

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external,
  logLevel: "info",
});

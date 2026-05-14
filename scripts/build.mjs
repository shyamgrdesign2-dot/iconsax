#!/usr/bin/env node
/**
 * Build dist/ from src/ : one ESM + one CJS bundle per style, plus a root entry.
 * Types are produced by `tsc` (see tsconfig.json).
 */
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { STYLES } from "./lib/mcp.mjs";

const SRC = path.resolve("src");
const DIST = path.resolve("dist");
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const common = {
  bundle: false,
  platform: "neutral",
  target: "es2020",
  jsx: "automatic",
  loader: { ".tsx": "tsx", ".ts": "ts" },
  outdir: DIST,
  outbase: SRC,
  logLevel: "warning",
};

// Discover every .tsx and .ts under src/
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const entryPoints = walk(SRC);
console.log(`[build] compiling ${entryPoints.length} files...`);

const BATCH = 1500;
function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function buildBatched(format, ext) {
  const batches = chunks(entryPoints, BATCH);
  console.log(`[build]  ${format}: ${batches.length} batches`);
  for (let i = 0; i < batches.length; i++) {
    process.stdout.write(`    batch ${i + 1}/${batches.length}\r`);
    await build({ ...common, entryPoints: batches[i], format, outExtension: { ".js": ext } });
  }
  console.log("");
}

// ESM only — modern bundlers (Vite, webpack 5, Rollup, esbuild) all handle ESM.
// Skipping CJS halves the build time and dist size.
await buildBatched("esm", ".js");

// Emit .d.ts files inline rather than running tsc. This is dramatically faster
// (no type-checking of 18K files) and avoids tsc tripping over the case-insensitive
// filesystem when two icon names Pascal-case to the same identifier.
console.log("[build] emitting .d.ts files...");
const DTS_COMPONENT = (comp) =>
  `import type { SVGProps } from "react";
declare const ${comp}: (props: SVGProps<SVGSVGElement>) => JSX.Element;
export default ${comp};
`;
let dtsCount = 0;
function emitDtsTree(srcDir, distDir) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const sp = path.join(srcDir, entry.name);
    const dp = path.join(distDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dp, { recursive: true });
      emitDtsTree(sp, dp);
    } else if (entry.name.endsWith(".tsx")) {
      const comp = entry.name.slice(0, -4);
      fs.writeFileSync(path.join(distDir, `${comp}.d.ts`), DTS_COMPONENT(comp));
      dtsCount++;
    } else if (entry.name === "index.ts") {
      // Mirror the JS barrel as a .d.ts barrel.
      const body = fs.readFileSync(sp, "utf8");
      fs.writeFileSync(path.join(distDir, "index.d.ts"), body);
      dtsCount++;
    }
  }
}
emitDtsTree(SRC, DIST);
console.log(`[build]   wrote ${dtsCount} .d.ts files`);

console.log("[build] DONE.");
console.log("        dist/ styles:", STYLES.filter((s) => fs.existsSync(path.join(DIST, s))).join(", "));

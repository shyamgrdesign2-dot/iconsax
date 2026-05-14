#!/usr/bin/env node
/**
 * Fetch SVGs for every name discovered by discover.mjs.
 * Writes:
 *   svg/<style>/<name>.svg          (one file per style/name)
 *   icons.json                       (manifest: {name, category, styles: [..]})
 *
 * Resumable: skips names whose SVGs are already on disk for every style.
 */
import fs from "node:fs";
import path from "node:path";
import { mcpCall, parseGetIcon, STYLES } from "./lib/mcp.mjs";

const SOURCE = process.env.SOURCE || "pro"; // "free" or "pro"
const TOOL = SOURCE === "free" ? "get_icon" : "get_pro_icon";
const NAMES_FILE = path.resolve(`crawl-state/names-${SOURCE}.json`);
const SVG_ROOT = path.resolve(`svg/${SOURCE}`);
const MANIFEST = path.resolve(`icons-${SOURCE}.json`);
const CONCURRENCY = Number(process.env.CONCURRENCY || 12);

if (!fs.existsSync(NAMES_FILE)) {
  // Fall back to legacy single-source names.json (for backwards compatibility).
  const legacy = path.resolve("crawl-state/names.json");
  if (SOURCE === "pro" && fs.existsSync(legacy)) {
    fs.copyFileSync(legacy, NAMES_FILE);
  }
}

if (!fs.existsSync(NAMES_FILE)) {
  console.error("Run `npm run crawl:discover` first.");
  process.exit(1);
}

for (const s of STYLES) fs.mkdirSync(path.join(SVG_ROOT, s), { recursive: true });

const { names: allNames, meta } = JSON.parse(fs.readFileSync(NAMES_FILE, "utf8"));
console.log(`[fetch] ${allNames.length} names to process. concurrency=${CONCURRENCY}`);

const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {};

function allFilesPresent(name) {
  // "Complete" if every style we already know about is on disk. For first-time
  // fetches we don't yet know the style set, so we require all 6 to be safe;
  // subsequent runs use the manifest to skip icons that only have a subset.
  const known = manifest[name]?.styles;
  const required = known && known.length ? known : STYLES;
  for (const s of required) {
    if (!fs.existsSync(path.join(SVG_ROOT, s, `${name}.svg`))) return false;
  }
  return true;
}

function svgPath(style, name) { return path.join(SVG_ROOT, style, `${name}.svg`); }

async function fetchOne(name) {
  if (allFilesPresent(name) && manifest[name]) return { name, skipped: true };
  const text = await mcpCall(TOOL, { name });
  const parsed = parseGetIcon(text);
  const stylesWritten = [];
  for (const [style, svg] of Object.entries(parsed.styles)) {
    if (!STYLES.includes(style)) continue;
    fs.writeFileSync(svgPath(style, name), svg + "\n");
    stylesWritten.push(style);
  }
  manifest[name] = {
    category: parsed.category || meta?.[name]?.category || "uncategorized",
    styles: stylesWritten.sort(),
  };
  return { name, styles: stylesWritten };
}

let cursor = 0;
let done = 0;
let written = 0;
let skipped = 0;
let failed = 0;
const failures = [];
const startedAt = Date.now();

async function worker(workerId) {
  while (true) {
    const idx = cursor++;
    if (idx >= allNames.length) return;
    const name = allNames[idx];
    try {
      const r = await fetchOne(name);
      if (r.skipped) skipped++; else written++;
    } catch (err) {
      failed++;
      failures.push({ name, error: String(err) });
    }
    done++;
    if (done % 50 === 0 || done === allNames.length) {
      const rate = done / ((Date.now() - startedAt) / 1000);
      const eta = Math.round((allNames.length - done) / Math.max(rate, 0.001));
      console.log(`  [${done}/${allNames.length}]  wrote=${written}  skipped=${skipped}  failed=${failed}  rate=${rate.toFixed(1)}/s  eta=${eta}s`);
      fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 0));
    }
  }
}

const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i));
await Promise.all(workers);

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
if (failures.length) {
  fs.writeFileSync("crawl-state/failures.json", JSON.stringify(failures, null, 2));
  console.log(`[fetch] ${failures.length} failures recorded -> crawl-state/failures.json`);
}
console.log(`[fetch] DONE. wrote=${written}  skipped=${skipped}  failed=${failed}`);

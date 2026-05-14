#!/usr/bin/env node
/**
 * Merge svg/free, svg/pro, svg/tp into a single flat svg/<style>/<name>.svg tree.
 *
 * Rules:
 *   - Iconsax styles (bold, broken, bulk, linear, outline, twotone) are the
 *     canonical 6-style set.
 *   - TP style mapping: line→linear, bulk→bulk, solid→bold.
 *   - When the same name exists in multiple sources for the same final style,
 *     keep them all and tag with a source suffix:
 *         pro  → <name>-pro
 *         free → <name>-free
 *         tp   → <name>-tp
 *     If a name is unique to a single source, no suffix.
 *     Source suffix uses `-` so it composes cleanly into PascalCase
 *     (`home-pro` → `HomePro`) and never collides with Iconsax's own
 *     numeric-suffixed names (`home-1`, `home-2`, …).
 *
 * Output:
 *   svg/<style>/<name>.svg
 *   icons.json   — { name: { source, originalName, category, styles: [...] } }
 *
 * Reads sources from svg-source/ (which is svg/free, svg/pro, svg/tp moved
 * aside) so the flattened svg/ ends up clean.
 */
import fs from "node:fs";
import path from "node:path";

const STYLES = ["bold", "broken", "bulk", "linear", "outline", "twotone"];
const SOURCES = ["pro", "free", "tp"]; // priority order
const SUFFIX = { pro: "-pro", free: "-free", tp: "-tp" };
const TP_STYLE_MAP = { line: "linear", bulk: "bulk", solid: "bold" };

const SOURCE_ROOT = path.resolve("svg-source"); // svg/{free,pro,tp} get moved here
const FLAT_ROOT = path.resolve("svg");
const MANIFEST = path.resolve("icons.json");

// If svg/free etc still live under svg/, move them aside to svg-source/.
if (!fs.existsSync(SOURCE_ROOT) && fs.existsSync(path.join(FLAT_ROOT, "pro"))) {
  fs.mkdirSync(SOURCE_ROOT, { recursive: true });
  for (const s of SOURCES) {
    const from = path.join(FLAT_ROOT, s);
    if (fs.existsSync(from)) fs.renameSync(from, path.join(SOURCE_ROOT, s));
  }
}

// Wipe & rebuild the flat tree.
for (const style of STYLES) {
  const d = path.join(FLAT_ROOT, style);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
}

function listNames(source, style) {
  const dir = path.join(SOURCE_ROOT, source, style);
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".svg")).map((f) => f.slice(0, -4))
    : [];
}

// First, build a map of {targetStyle: {name: Set<source>}} so we know which
// (name, style) pairs collide across sources.
const presence = {};
for (const style of STYLES) presence[style] = {};

for (const source of SOURCES) {
  const sourceRoot = path.join(SOURCE_ROOT, source);
  if (!fs.existsSync(sourceRoot)) continue;
  const styleDirs = fs.readdirSync(sourceRoot);
  for (const srcStyle of styleDirs) {
    // Map TP style names; Iconsax styles keep their names.
    const targetStyle = source === "tp" ? TP_STYLE_MAP[srcStyle] : srcStyle;
    if (!targetStyle || !STYLES.includes(targetStyle)) continue;
    for (const n of listNames(source, srcStyle)) {
      (presence[targetStyle][n] ||= new Set()).add(source);
    }
  }
}

// Manifest entry per FINAL name (after collision rename).
const manifest = {};

// Now copy with collision-aware renaming.
let copied = 0;
for (const source of SOURCES) {
  const sourceRoot = path.join(SOURCE_ROOT, source);
  if (!fs.existsSync(sourceRoot)) continue;
  const styleDirs = fs.readdirSync(sourceRoot);
  for (const srcStyle of styleDirs) {
    const targetStyle = source === "tp" ? TP_STYLE_MAP[srcStyle] : srcStyle;
    if (!targetStyle || !STYLES.includes(targetStyle)) continue;
    const targetDir = path.join(FLAT_ROOT, targetStyle);
    for (const origName of listNames(source, srcStyle)) {
      const collides = (presence[targetStyle][origName]?.size || 0) > 1;
      const finalName = collides ? `${origName}${SUFFIX[source]}` : origName;
      const fromFile = path.join(sourceRoot, srcStyle, `${origName}.svg`);
      const toFile = path.join(targetDir, `${finalName}.svg`);
      fs.copyFileSync(fromFile, toFile);
      copied++;
      const m = (manifest[finalName] ||= { source, originalName: origName, styles: [] });
      if (!m.styles.includes(targetStyle)) m.styles.push(targetStyle);
    }
  }
}

// Sort manifest entries and styles.
const sorted = {};
for (const k of Object.keys(manifest).sort()) {
  manifest[k].styles.sort();
  sorted[k] = manifest[k];
}
fs.writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2));

// Summary.
const byStyle = {};
for (const style of STYLES) {
  byStyle[style] = fs.readdirSync(path.join(FLAT_ROOT, style)).length;
}
const renamed = Object.values(sorted).filter((m) => m.originalName !== Object.keys(sorted).find((k) => sorted[k] === m)).length;
console.log("[merge] flat svg/<style>/ counts:", byStyle);
console.log(`[merge] total files copied: ${copied}  unique component names: ${Object.keys(sorted).length}`);
console.log(`[merge] renamed (collision-numbered) names: ${Object.keys(sorted).filter(k => sorted[k].originalName !== k).length}`);
console.log(`[merge] sources kept aside at: ${SOURCE_ROOT}`);

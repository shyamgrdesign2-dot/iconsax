#!/usr/bin/env node
/**
 * Import TP Medical custom icons into the package's svg/ tree.
 *
 * Source layout (input):
 *   <SOURCE_DIR>/<name>--<style>.svg
 *
 * Output:
 *   svg/tp/<style>/<name>.svg
 *   icons-tp.json   (manifest: per-name category + styles)
 *
 * Idempotent — safe to re-run when the source directory changes.
 */
import fs from "node:fs";
import path from "node:path";

const SOURCE_DIRS = [
  { dir: "/Users/shyamsundar/Desktop/Dr.Agent-main/public/icons/medical", category: "medical" },
];
const OUT_ROOT = path.resolve("svg/tp");
const MANIFEST = path.resolve("icons-tp.json");

const manifest = {};
let copied = 0;
let skipped = 0;

for (const { dir, category } of SOURCE_DIRS) {
  if (!fs.existsSync(dir)) {
    console.error(`[import-tp] source missing: ${dir}`);
    continue;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".svg"));
  for (const file of files) {
    // Filename format: "<name>--<style>.svg". Split on the last "--".
    const base = file.slice(0, -4);
    const idx = base.lastIndexOf("--");
    if (idx === -1) {
      console.warn(`[import-tp] skipping (no -- separator): ${file}`);
      skipped++;
      continue;
    }
    const name = base.slice(0, idx);
    const style = base.slice(idx + 2);

    const outDir = path.join(OUT_ROOT, style);
    fs.mkdirSync(outDir, { recursive: true });
    fs.copyFileSync(path.join(dir, file), path.join(outDir, `${name}.svg`));
    copied++;

    if (!manifest[name]) manifest[name] = { category, styles: [] };
    if (!manifest[name].styles.includes(style)) manifest[name].styles.push(style);
  }
}

for (const n of Object.keys(manifest)) manifest[n].styles.sort();
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

console.log(`[import-tp] copied=${copied} skipped=${skipped} names=${Object.keys(manifest).length}`);
console.log(`[import-tp] styles seen: ${[...new Set(Object.values(manifest).flatMap((v) => v.styles))].sort().join(", ")}`);

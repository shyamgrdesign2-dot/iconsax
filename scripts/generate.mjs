#!/usr/bin/env node
/**
 * Generate React TSX components and barrel index files from the raw SVGs in
 * svg/<style>/<name>.svg.
 *
 * Layout produced:
 *   src/<style>/<PascalName>.tsx     (one React component per icon)
 *   src/<style>/index.ts             (barrel export)
 *   src/index.ts                     (root barrel re-exporting each style as namespace)
 */
import fs from "node:fs";
import path from "node:path";

const SVG_ROOT = path.resolve("svg");
const SRC_ROOT = path.resolve("src");

function listDirs(d) {
  return fs.existsSync(d)
    ? fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];
}

function toPascal(name) {
  // Map non-identifier characters to readable words before splitting.
  const cleaned = name
    .replace(/\+/g, "-plus-")
    .replace(/&/g, "-and-")
    .replace(/%/g, "-percent-")
    .replace(/'/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-");
  const parts = cleaned.split(/[-_]+/).filter(Boolean);
  const pascal = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  return /^[0-9]/.test(pascal) ? `Icon${pascal}` : pascal;
}

function sanitizeSvg(svg, componentName) {
  // Strip the outer <svg ...> wrapper so we can inject our own props/attrs at runtime.
  const m = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>\s*$/i);
  let inner = m ? m[1] : svg;

  // Convert kebab-case attributes to camelCase for JSX.
  inner = inner
    .replace(/\bclip-path=/g, "clipPath=")
    .replace(/\bclip-rule=/g, "clipRule=")
    .replace(/\bfill-rule=/g, "fillRule=")
    .replace(/\bstroke-width=/g, "strokeWidth=")
    .replace(/\bstroke-linecap=/g, "strokeLinecap=")
    .replace(/\bstroke-linejoin=/g, "strokeLinejoin=")
    .replace(/\bstroke-miterlimit=/g, "strokeMiterlimit=")
    .replace(/\bstroke-dasharray=/g, "strokeDasharray=")
    .replace(/\bstroke-opacity=/g, "strokeOpacity=")
    .replace(/\bfill-opacity=/g, "fillOpacity=")
    .replace(/\bstop-color=/g, "stopColor=")
    .replace(/\bstop-opacity=/g, "stopOpacity=");

  // Replace baked-in colors with currentColor so the icon inherits text color.
  inner = inner.replace(/(stroke|fill)="(?:white|#fff|#ffffff|#FFF|#FFFFFF|black|#000|#000000)"/g, '$1="currentColor"');

  // Prefix internal ids (clipPath, mask, filter, linearGradient...) with the
  // component name so multiple icons on the same page can't collide. We match
  // id="..." and url(#...) and xlink:href="#...".
  const idMap = new Map();
  inner = inner.replace(/\bid="([^"]+)"/g, (_, id) => {
    const newId = `${componentName}__${id}`;
    idMap.set(id, newId);
    return `id="${newId}"`;
  });
  for (const [oldId, newId] of idMap) {
    const oldEsc = oldId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    inner = inner.replace(new RegExp(`url\\(#${oldEsc}\\)`, "g"), `url(#${newId})`);
    inner = inner.replace(new RegExp(`(href|xlinkHref|xlink:href)="#${oldEsc}"`, "g"), `$1="#${newId}"`);
  }

  // xlink:href → xlinkHref for JSX.
  inner = inner.replace(/\bxlink:href=/g, "xlinkHref=");

  // Convert HTML-style `style="prop:val;prop2:val2"` to a JSX object literal.
  inner = inner.replace(/\bstyle="([^"]+)"/g, (_, decl) => {
    const obj = decl
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [k, ...rest] = d.split(":");
        const key = (k || "").trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        const val = rest.join(":").trim();
        return `${JSON.stringify(key)}: ${JSON.stringify(val)}`;
      })
      .join(", ");
    return `style={{${obj}}}`;
  });

  return inner;
}

function buildComponent(componentName, innerSvg) {
  return `import * as React from "react";
import type { SVGProps } from "react";
const ${componentName} = (props: SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={24} height={24} viewBox="0 0 24 24" fill="none" {...props}>${innerSvg}</svg>
);
export default ${componentName};
`;
}

function buildDts(componentName) {
  return `import type { SVGProps } from "react";
declare const ${componentName}: (props: SVGProps<SVGSVGElement>) => JSX.Element;
export default ${componentName};
`;
}

fs.rmSync(SRC_ROOT, { recursive: true, force: true });
fs.mkdirSync(SRC_ROOT, { recursive: true });

const SOURCES = listDirs(SVG_ROOT); // e.g. ["free", "pro", "tp"]
// Each source defines its own style set on disk. Iconsax sources expose 6
// styles (bold/broken/bulk/linear/outline/twotone); TP exposes 3 (bulk/line/solid).
const stylesBySource = Object.fromEntries(SOURCES.map((s) => [s, listDirs(path.join(SVG_ROOT, s))]));
const summary = {};
const allComponentNames = new Set();

for (const source of SOURCES) for (const style of stylesBySource[source]) {
  const styleDir = path.join(SVG_ROOT, source, style);
  const outDir = path.join(SRC_ROOT, source, style);
  fs.mkdirSync(outDir, { recursive: true });

  const files = fs.readdirSync(styleDir).filter((f) => f.endsWith(".svg")).sort();
  const indexLines = [];
  const indexDtsLines = [];
  // Track collisions case-insensitively because macOS/Windows filesystems are
  // case-insensitive by default.
  const seenCI = new Map(); // lowercase componentName -> { comp, name }

  for (const file of files) {
    const name = file.slice(0, -4);
    let comp = toPascal(name);
    const ciKey = comp.toLowerCase();
    if (seenCI.has(ciKey) && seenCI.get(ciKey).name !== name) {
      let n = 2;
      while (seenCI.has(`${ciKey}_${n}`)) n++;
      comp = `${comp}_${n}`;
    }
    seenCI.set(comp.toLowerCase(), { comp, name });
    allComponentNames.add(comp);

    const svg = fs.readFileSync(path.join(styleDir, file), "utf8");
    const inner = sanitizeSvg(svg, comp);
    fs.writeFileSync(path.join(outDir, `${comp}.tsx`), buildComponent(comp, inner));
    indexLines.push(`export { default as ${comp} } from "./${comp}";`);
    indexDtsLines.push(`export { default as ${comp} } from "./${comp}";`);
  }

  fs.writeFileSync(path.join(outDir, "index.ts"), indexLines.join("\n") + "\n");
  summary[`${source}/${style}`] = files.length;
  console.log(`[generate] ${source}/${style}: ${files.length} components`);
}

// Per-source barrel: e.g. import { Bold, Linear } from "@iconsax/icons/pro".
// Style names become PascalCase namespace names.
for (const source of SOURCES) {
  const styles = stylesBySource[source].filter((s) => fs.existsSync(path.join(SRC_ROOT, source, s)));
  fs.writeFileSync(
    path.join(SRC_ROOT, source, "index.ts"),
    styles
      .map((s) => `export * as ${s.charAt(0).toUpperCase() + s.slice(1)} from "./${s}/index.js";`)
      .join("\n") + "\n"
  );
}

// Root barrel: re-export each source as a namespace so users can do
//   import { Free, Pro } from "@iconsax/icons";
//   <Pro.Linear.AiHome />
fs.writeFileSync(
  path.join(SRC_ROOT, "index.ts"),
  SOURCES
    .map((s) => `export * as ${s.charAt(0).toUpperCase() + s.slice(1)} from "./${s}/index.js";`)
    .join("\n") + "\n"
);

fs.writeFileSync(
  path.resolve("src/summary.json"),
  JSON.stringify(summary, null, 2)
);

console.log(`[generate] DONE. sources=${SOURCES.join(",")}  total component files=${Object.values(summary).reduce((a, b) => a + b, 0)}`);

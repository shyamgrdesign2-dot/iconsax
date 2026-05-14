#!/usr/bin/env node
/**
 * Quick stats over what we've crawled so far. Useful to run mid-crawl.
 */
import fs from "node:fs";
import path from "node:path";
import { STYLES } from "./mcp.mjs";

const root = path.resolve("svg");
let total = 0;
for (const s of STYLES) {
  const d = path.join(root, s);
  if (!fs.existsSync(d)) { console.log(`  ${s}: -`); continue; }
  const n = fs.readdirSync(d).filter((f) => f.endsWith(".svg")).length;
  total += n;
  console.log(`  ${s}: ${n}`);
}
console.log(`  total: ${total}`);

const namesFile = "crawl-state/names.json";
if (fs.existsSync(namesFile)) {
  const { names } = JSON.parse(fs.readFileSync(namesFile, "utf8"));
  console.log(`  unique-names-in-index: ${names.length}`);
}

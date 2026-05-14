#!/usr/bin/env node
/**
 * Sync the in-progress discover state into the names.json the fetcher reads.
 * Lets you start fetching SVGs before discovery completes.
 */
import fs from "node:fs";
import path from "node:path";

const STATE = path.resolve("crawl-state/discover.json");
const OUT = path.resolve("crawl-state/names.json");
if (!fs.existsSync(STATE)) { console.error("no discover.json yet"); process.exit(1); }
const s = JSON.parse(fs.readFileSync(STATE, "utf8"));
const names = Object.keys(s.names).sort();
fs.writeFileSync(OUT, JSON.stringify({ names, meta: s.names }, null, 2));
console.log(`synced ${names.length} names → ${OUT}`);

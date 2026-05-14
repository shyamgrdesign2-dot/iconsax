#!/usr/bin/env node
/**
 * Extra discovery pass: for each known category, exhaustively try 2-letter
 * substring queries (1296 per cat). The original discover.mjs only ran
 * 2-letter expansions on capped single-letter buckets, which may miss icons
 * whose names share no single-letter substring with the first 50 names.
 *
 * Merges results back into crawl-state/discover.json.
 */
import fs from "node:fs";
import path from "node:path";
import { mcpCall, parseSearch } from "./lib/mcp.mjs";

const STATE_FILE = path.resolve("crawl-state/discover.json");
const NAMES_FILE = path.resolve("crawl-state/names.json");
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
const CONCURRENCY = Number(process.env.CONCURRENCY || 12);

const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
state.queriesDone = state.queriesDone || {};

function record(items) {
  let added = 0;
  for (const it of items) {
    if (!state.names[it.name]) {
      state.names[it.name] = { category: it.category, styles: [it.style] };
      added++;
    } else {
      const s = state.names[it.name];
      if (!s.styles.includes(it.style)) s.styles.push(it.style);
    }
  }
  return added;
}

const cats = [...state.categories].sort();
const tasks = [];
for (const cat of cats) {
  for (const a of ALPHABET) {
    for (const b of ALPHABET) {
      const key = `${cat}::${a}${b}`;
      if (state.queriesDone[key]) continue;
      tasks.push({ category: cat, query: a + b });
    }
  }
}
console.log(`[extra] ${tasks.length} new queries across ${cats.length} cats`);

let cursor = 0, done = 0, found = 0;
const start = Date.now();
async function worker() {
  while (true) {
    const idx = cursor++;
    if (idx >= tasks.length) return;
    const t = tasks[idx];
    try {
      const text = await mcpCall("search_pro_icons", { category: t.category, query: t.query, limit: 50, include_svg: false });
      const items = parseSearch(text);
      found += record(items);
      state.queriesDone[`${t.category}::${t.query}`] = { hits: items.length, capped: items.length >= 50 };
    } catch (err) {
      console.error("err:", String(err).slice(0, 120));
    }
    done++;
    if (done % 500 === 0 || done === tasks.length) {
      const rate = done / Math.max((Date.now() - start) / 1000, 0.001);
      console.log(`  [extra] ${done}/${tasks.length}  names=${Object.keys(state.names).length}  newFound=${found}  rate=${rate.toFixed(1)}/s`);
      fs.writeFileSync(STATE_FILE, JSON.stringify(state));
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

fs.writeFileSync(STATE_FILE, JSON.stringify(state));
const names = Object.keys(state.names).sort();
fs.writeFileSync(NAMES_FILE, JSON.stringify({ names, meta: state.names }, null, 2));
console.log(`[extra] DONE. total names=${names.length} (added ${found})`);

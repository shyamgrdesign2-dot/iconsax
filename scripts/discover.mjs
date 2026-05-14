#!/usr/bin/env node
/**
 * Discover all icon names from Iconsax Pro by issuing many substring searches.
 *
 * The MCP search caps at 50 results and has no offset, so we enumerate by:
 *   1. Seed: single-letter queries with no category to harvest the category set.
 *   2. For each category: empty + every single-letter substring.
 *   3. For any (category, prefix) bucket that hit the 50-cap, expand to 2-letter.
 *   4. Same again for 3-letter.
 *   5. Final global pass: no-category, two-letter substrings, to mop up names
 *      whose category we never learned.
 *
 * Queries run through a worker pool with periodic state checkpointing so the
 * crawl is resumable on Ctrl+C.
 *
 * Output: crawl-state/names.json  (array of unique names + per-name metadata)
 */
import fs from "node:fs";
import path from "node:path";
import { mcpCall, parseSearch } from "./lib/mcp.mjs";

const STATE_DIR = path.resolve("crawl-state");
fs.mkdirSync(STATE_DIR, { recursive: true });
const STATE_FILE = path.join(STATE_DIR, "discover.json");
const NAMES_FILE = path.join(STATE_DIR, "names.json");

const LIMIT = 50;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
const CONCURRENCY = Number(process.env.CONCURRENCY || 12);

function loadState() {
  if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  return { categories: [], names: {}, queriesDone: {} };
}
function saveState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s));
}

const state = loadState();
let pendingSinceSave = 0;

function record(items) {
  for (const it of items) {
    if (!state.names[it.name]) {
      state.names[it.name] = { category: it.category, styles: [it.style] };
    } else {
      const s = state.names[it.name];
      if (!s.styles.includes(it.style)) s.styles.push(it.style);
      if (!s.category && it.category) s.category = it.category;
    }
    if (it.category && !state.categories.includes(it.category)) {
      state.categories.push(it.category);
    }
  }
}

async function runQuery(query, category) {
  const key = `${category || ""}::${query || ""}`;
  if (state.queriesDone[key]) return state.queriesDone[key];
  const args = { limit: LIMIT, include_svg: false };
  if (query) args.query = query;
  if (category) args.category = category;
  const text = await mcpCall("search_pro_icons", args);
  const items = parseSearch(text);
  record(items);
  const result = { hits: items.length, capped: items.length >= LIMIT };
  state.queriesDone[key] = result;
  pendingSinceSave++;
  if (pendingSinceSave >= 50) { saveState(state); pendingSinceSave = 0; }
  return result;
}

// Worker-pool runner over a list of {query, category} tasks.
async function runTasks(tasks, label) {
  let cursor = 0;
  let done = 0;
  const cappedTasks = [];
  const start = Date.now();
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= tasks.length) return;
      const t = tasks[idx];
      try {
        const r = await runQuery(t.query, t.category);
        if (r.capped) cappedTasks.push(t);
      } catch (err) {
        console.error(`[${label}] error q="${t.query}" cat="${t.category}":`, String(err).slice(0, 200));
      }
      done++;
      if (done % 100 === 0 || done === tasks.length) {
        const rate = done / Math.max((Date.now() - start) / 1000, 0.001);
        console.log(`  [${label}] ${done}/${tasks.length}  names=${Object.keys(state.names).length}  cats=${state.categories.length}  rate=${rate.toFixed(1)}/s`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  saveState(state);
  return cappedTasks;
}

async function main() {
  // Phase 1: WIDE category discovery — 2-letter no-category sweep first so we
  // harvest the full pro category set up-front (single-letter queries only
  // reveal categories whose icons sort alphabetically into the first 50 hits).
  console.log("[discover] phase 1: wide category discovery (no-category, 2-letter)");
  const seedTasks = [];
  for (const ch of ALPHABET) seedTasks.push({ query: ch, category: null });
  for (const a of ALPHABET) for (const b of ALPHABET) seedTasks.push({ query: a + b, category: null });
  await runTasks(seedTasks, "seed");
  console.log(`  categories discovered: ${state.categories.length} → ${[...state.categories].sort().join(", ")}`);

  // Phase 2: per-category empty + single-letter sweep.
  console.log("[discover] phase 2: per-category sweep");
  const cats = [...state.categories].sort();
  const phase2 = [];
  for (const cat of cats) {
    phase2.push({ query: "", category: cat });
    for (const ch of ALPHABET) phase2.push({ query: ch, category: cat });
  }
  let capped = await runTasks(phase2, "cat-sweep");

  // Phase 3: 2-letter expansion for capped buckets.
  console.log(`[discover] phase 3: 2-letter expansion (${capped.length} capped buckets)`);
  const phase3 = [];
  for (const t of capped) {
    for (const ch of ALPHABET) phase3.push({ query: (t.query || "") + ch, category: t.category });
  }
  capped = await runTasks(phase3, "2-letter");

  // Phase 4: 3-letter expansion for any still-capped.
  console.log(`[discover] phase 4: 3-letter expansion (${capped.length} capped buckets)`);
  const phase4 = [];
  for (const t of capped) {
    for (const ch of ALPHABET) phase4.push({ query: t.query + ch, category: t.category });
  }
  await runTasks(phase4, "3-letter");

  // Phase 5: global mop-up — 3-letter substrings with no category, only on
  // 2-letter combos whose no-category query was capped in phase 1.
  console.log("[discover] phase 5: global 3-letter mop-up");
  const phase5 = [];
  for (const [key, r] of Object.entries(state.queriesDone)) {
    if (!r.capped) continue;
    const [cat, q] = key.split("::");
    if (cat || !q || q.length !== 2) continue;
    for (const ch of ALPHABET) phase5.push({ query: q + ch, category: null });
  }
  await runTasks(phase5, "global-3");

  const names = Object.keys(state.names).sort();
  fs.writeFileSync(NAMES_FILE, JSON.stringify({ names, meta: state.names }, null, 2));
  console.log(`[discover] DONE. unique names=${names.length}  categories=${state.categories.length}`);
  console.log(`           -> ${NAMES_FILE}`);
}

main().catch((e) => { console.error(e); saveState(state); process.exit(1); });

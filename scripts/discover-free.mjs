#!/usr/bin/env node
/**
 * Discover all free (non-Pro) Iconsax icon names.
 *
 * Free uses `search_icons`, `list_categories`, and `get_icons_by_category` —
 * different endpoints from the Pro side. `get_icons_by_category` allows
 * limit=100 so per-category enumeration is more efficient than search.
 *
 * Output: crawl-state/names-free.json
 */
import fs from "node:fs";
import path from "node:path";
import { mcpCall, parseSearch } from "./lib/mcp.mjs";

const STATE_DIR = path.resolve("crawl-state");
fs.mkdirSync(STATE_DIR, { recursive: true });
const STATE_FILE = path.join(STATE_DIR, "discover-free.json");
const NAMES_FILE = path.join(STATE_DIR, "names-free.json");

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
const CONCURRENCY = Number(process.env.CONCURRENCY || 12);

function loadState() {
  if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  return { categories: [], names: {}, queriesDone: {} };
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); }

const state = loadState();

function record(items) {
  for (const it of items) {
    if (!state.names[it.name]) {
      state.names[it.name] = { category: it.category, styles: [it.style] };
    } else {
      const s = state.names[it.name];
      if (it.style && !s.styles.includes(it.style)) s.styles.push(it.style);
      if (!s.category && it.category) s.category = it.category;
    }
    if (it.category && !state.categories.includes(it.category)) state.categories.push(it.category);
  }
}

async function runListCategories() {
  const text = await mcpCall("list_categories", {});
  // Parse "| <cat> | <count> |" rows from the markdown table.
  const re = /\|\s+([\w-]+)\s+\|\s+(\d+)\s+\|/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1] === "Category") continue;
    if (!state.categories.includes(m[1])) state.categories.push(m[1]);
  }
  console.log(`[free] list_categories: ${state.categories.length} categories`);
}

async function runQuery(tool, args, key) {
  if (state.queriesDone[key]) return state.queriesDone[key];
  const text = await mcpCall(tool, args);
  const items = parseSearch(text);
  record(items);
  state.queriesDone[key] = { hits: items.length, capped: items.length >= (args.limit || 50) };
  return state.queriesDone[key];
}

async function runTasks(tasks, label) {
  let cursor = 0;
  let done = 0;
  const start = Date.now();
  const capped = [];
  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor++;
      if (idx >= tasks.length) return;
      const t = tasks[idx];
      try {
        const r = await runQuery(t.tool, t.args, t.key);
        if (r.capped) capped.push(t);
      } catch (err) {
        console.error(`[${label}] err key=${t.key}:`, String(err).slice(0, 120));
      }
      done++;
      if (done % 50 === 0 || done === tasks.length) {
        const rate = done / Math.max((Date.now() - start) / 1000, 0.001);
        console.log(`  [${label}] ${done}/${tasks.length}  names=${Object.keys(state.names).length}  rate=${rate.toFixed(1)}/s`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  saveState(state);
  return capped;
}

async function main() {
  console.log("[free] phase 0: list_categories");
  await runListCategories();
  saveState(state);

  // Phase 1: enumerate each category via get_icons_by_category (limit=100).
  console.log("[free] phase 1: per-category exhaustive listing");
  const tasks = state.categories.map((cat) => ({
    tool: "get_icons_by_category",
    args: { category: cat, limit: 100 },
    key: `cat::${cat}`,
  }));
  let capped = await runTasks(tasks, "cat-list");

  // Phase 2: for any capped category, split with single-letter substring filter.
  console.log("[free] phase 2: capped-category substring fan-out");
  const phase2 = [];
  for (const t of capped) {
    for (const ch of ALPHABET) {
      phase2.push({
        tool: "search_icons",
        args: { category: t.args.category, query: ch, limit: 50 },
        key: `search::${t.args.category}::${ch}`,
      });
    }
  }
  capped = await runTasks(phase2, "search-cat-1");

  // Phase 3: 2-letter for any still-capped.
  console.log("[free] phase 3: 2-letter fan-out");
  const phase3 = [];
  for (const t of capped) {
    const q1 = t.args.query;
    for (const ch of ALPHABET) {
      phase3.push({
        tool: "search_icons",
        args: { category: t.args.category, query: q1 + ch, limit: 50 },
        key: `search::${t.args.category}::${q1}${ch}`,
      });
    }
  }
  await runTasks(phase3, "search-cat-2");

  // Phase 4: global no-category 2-letter mop-up via search_icons (in case
  // some icons live in categories we didn't pick up).
  console.log("[free] phase 4: global mop-up");
  const phase4 = [];
  for (const a of ALPHABET) for (const b of ALPHABET) {
    phase4.push({ tool: "search_icons", args: { query: a + b, limit: 50 }, key: `g::${a}${b}` });
  }
  await runTasks(phase4, "global");

  const names = Object.keys(state.names).sort();
  fs.writeFileSync(NAMES_FILE, JSON.stringify({ names, meta: state.names }, null, 2));
  console.log(`[free] DONE. unique names=${names.length}  categories=${state.categories.length}`);
}

main().catch((e) => { console.error(e); saveState(state); process.exit(1); });

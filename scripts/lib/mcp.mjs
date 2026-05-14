import { setTimeout as sleep } from "node:timers/promises";

const MCP_URL = process.env.ICONSAX_MCP_URL || "https://app.iconsax.io/api/mcp";
function getToken() {
  const t = process.env.ICONSAX_TOKEN;
  if (!t) {
    console.error("ICONSAX_TOKEN env var is required.");
    process.exit(1);
  }
  return t;
}

let id = 0;
function nextId() { return ++id; }

/**
 * Parse the SSE-style response the MCP server returns.
 * Body looks like: "event: message\ndata: {...json...}\n\n" or plain JSON.
 */
function parseMcpBody(text) {
  text = text.trim();
  if (text.startsWith("{")) return JSON.parse(text);
  // SSE: pull last `data:` line
  const lines = text.split(/\r?\n/);
  const dataLines = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
  if (dataLines.length === 0) throw new Error("No data line in MCP response: " + text.slice(0, 200));
  return JSON.parse(dataLines[dataLines.length - 1]);
}

export async function mcpCall(toolName, args, { retries = 4, retryDelayMs = 800 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(MCP_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: nextId(),
          method: "tools/call",
          params: { name: toolName, arguments: args },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
      }
      const body = await res.text();
      const parsed = parseMcpBody(body);
      if (parsed.error) throw new Error(`MCP error: ${JSON.stringify(parsed.error)}`);
      const text = parsed?.result?.content?.[0]?.text;
      if (typeof text !== "string") throw new Error("Unexpected MCP response shape: " + JSON.stringify(parsed).slice(0, 300));
      return text;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const delay = retryDelayMs * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }
  throw lastErr;
}

/**
 * Parse search response markdown into a list of {name, style, category}.
 * Expected lines: "📦 **<name>** [<style>] — <category>"
 */
export function parseSearch(text) {
  if (text.includes("No icons found")) return [];
  const out = [];
  const re = /\*\*([^*]+)\*\*\s+\[([^\]]+)\]\s+[—-]\s+([\w-]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ name: m[1].trim(), style: m[2].trim(), category: m[3].trim() });
  }
  return out;
}

/**
 * Parse get_pro_icon response into { name, category, styles: {styleName: svg} }.
 */
export function parseGetIcon(text) {
  const headerMatch = text.match(/#\s*🎨\s*([^\s(]+)\s*\(([^)]+)\)/);
  if (!headerMatch) throw new Error("Could not parse icon header: " + text.slice(0, 200));
  const name = headerMatch[1].trim();
  const category = headerMatch[2].trim();
  const styles = {};
  const styleRe = /##\s*Style:\s*(\w+)\s*\n```svg\n([\s\S]*?)\n```/g;
  let m;
  while ((m = styleRe.exec(text)) !== null) {
    styles[m[1].trim()] = m[2].trim();
  }
  return { name, category, styles };
}

export const STYLES = ["bold", "broken", "bulk", "linear", "outline", "twotone"];

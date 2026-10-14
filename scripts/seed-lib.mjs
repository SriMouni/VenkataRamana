// Shared helpers for turning data/stories.json into SQL inserts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

export function textToHtml(text) {
  // Put the closing greeting ("శుభోదయ వందనాలతో..") on its own line.
  return escapeHtml(text)
    .split(/(?=శుభ\S*\s*\S*వందనాలతో)/u)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("");
}

function dollarQuote(s) {
  let tag = "$s$";
  while (s.includes(tag)) tag = tag.slice(0, -1) + "s$";
  return `${tag}${s}${tag}`;
}

export function loadStories() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "stories.json"), "utf8"));
}

export function insertSql(stories) {
  const rows = stories.map((s) => `(${dollarQuote(s.title)}, ${dollarQuote(textToHtml(s.body))})`);
  return "insert into public.stories (title, body) values\n" + rows.join(",\n") + ";\n";
}

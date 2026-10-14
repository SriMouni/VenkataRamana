// Turn data/stories.json into supabase/seed.sql (for pasting into the Supabase SQL Editor by hand).
// Usage: npm run seed
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadStories, insertSql } from "./seed-lib.mjs";

const stories = loadStories();
const out = path.join(ROOT, "supabase", "seed.sql");
fs.writeFileSync(out, insertSql(stories), "utf8");
console.log(`Wrote ${stories.length} stories to ${out}`);

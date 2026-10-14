// Tiny static server for testing the site locally (serves only the website files, never .env).
// Usage: npm start   -> http://localhost:3000
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED = ["index.html", "admin.html", "css", "js", "assets"];
const PORT = Number(process.env.PORT) || 3000;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon" };

http
  .createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(/^\/+/, "") || "index.html";
    const file = path.normalize(path.join(ROOT, rel));
    const top = path.relative(ROOT, file).split(path.sep)[0];
    if (!ALLOWED.includes(top) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": (MIME[path.extname(file)] || "application/octet-stream") + "; charset=utf-8", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`Site running at http://localhost:${PORT}  (admin: http://localhost:${PORT}/admin.html)  Ctrl+C to stop`));

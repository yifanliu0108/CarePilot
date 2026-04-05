/**
 * Production static server for Railway — no Vite at runtime (Vite is devDependency;
 * `npm ci --omit=dev` would omit it → `vite preview` → 502).
 * Uses only Node builtins: bind 0.0.0.0:$PORT and serve frontend/dist (SPA fallback).
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "dist");
const port = Number(process.env.PORT) || 4173;
const host = "0.0.0.0";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

function contentType(filePath) {
  return mime[path.extname(filePath)] || "application/octet-stream";
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end();
    return;
  }
  const url = new URL(req.url || "/", "http://localhost");
  let rel = url.pathname;
  if (rel.includes("..")) {
    res.writeHead(403);
    res.end();
    return;
  }
  const tryFile = path.join(root, rel === "/" ? "index.html" : rel);
  fs.stat(tryFile, (err, st) => {
    if (!err && st.isFile()) {
      res.writeHead(200, { "Content-Type": contentType(tryFile) });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      fs.createReadStream(tryFile).pipe(res);
      return;
    }
    const index = path.join(root, "index.html");
    fs.readFile(index, (e2, data) => {
      if (e2) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(
          "Missing frontend/dist (index.html). Run the build step before start.",
        );
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
  });
});

server.listen(port, host, () => {
  console.log(`carepilot-frontend static ${root} http://${host}:${port}`);
});

server.on("error", (err) => {
  console.error("carepilot-frontend static server failed:", err?.message ?? err);
  process.exit(1);
});

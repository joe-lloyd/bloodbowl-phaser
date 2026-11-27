import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Locator } from "@playwright/test";

const PAGE = "index.html";
const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".svg": "image/svg+xml",
};

export interface DistServer {
  readonly origin: string;
  stop(): Promise<void>;
}

async function distFile(root: string, file: string): Promise<{ name: string; body: Buffer }> {
  const full = path.resolve(root, file);
  try {
    if (!full.startsWith(root + path.sep)) throw new Error(`${file} is outside ${root}`);
    return { name: file, body: await readFile(full) };
  } catch {
    return { name: PAGE, body: await readFile(path.join(root, PAGE)) };
  }
}

export function serveDist(dist: string, port: number): DistServer {
  const root = path.resolve(dist);
  const origin = `http://127.0.0.1:${String(port)}`;
  const server: Server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", origin).pathname;
    const answer = async () => {
      const { name, body } = await distFile(root, decodeURIComponent(pathname).slice(1) || PAGE);
      response.writeHead(200, {
        "content-type": TYPES[path.extname(name)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(body);
    };
    void answer();
  }).listen(port, "127.0.0.1");
  return {
    origin,
    stop: () => {
      server.closeAllConnections();
      return new Promise((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  };
}

export const failures: string[] = [];

export function check(name: string, passed: boolean, detail = ""): void {
  console.log(`${passed ? "ok  " : "FAIL"} ${name} ${detail}`);
  if (!passed) failures.push(name);
}

export async function appears(locator: Locator, timeout: number): Promise<boolean> {
  try {
    await locator.waitFor({ timeout });
    return true;
  } catch {
    return false;
  }
}

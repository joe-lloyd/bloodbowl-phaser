import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import path from "node:path";
import { studioEnvironment } from "../boundary/studio";
import { answerApi, answerSprite } from "./answer";
import { refreshTree } from "./publish";

function readToken(home: string): Buffer {
  const token = readFileSync(path.join(home, "token"), "utf8").trim();
  if (token.length < 32) throw new Error("The helper token is missing or too short");
  return Buffer.from(token);
}

function allowed(request: IncomingMessage, token: Buffer): boolean {
  const given = Buffer.from(String(request.headers["x-studio-token"] ?? ""));
  return given.length === token.length && timingSafeEqual(given, token);
}

const { STUDIO_HOME } = studioEnvironment();
if (STUDIO_HOME === undefined) throw new Error("Set STUDIO_HOME to the helper's folder");
const PORT = 3941;
const API = "/studio-api";
const SPRITES = "/sprites";
const token = readToken(STUDIO_HOME);

const server = createServer((request, response) => {
  const url = request.url ?? "/";
  if (!allowed(request, token)) {
    response.writeHead(401).end();
  } else if (url.startsWith(`${SPRITES}/`)) {
    request.url = url.slice(SPRITES.length);
    answerSprite(request, response);
  } else if (url.startsWith(`${API}/`)) {
    request.url = url.slice(API.length);
    void answerApi(request, response);
  } else {
    response.writeHead(404).end();
  }
});

try {
  await refreshTree();
} catch (error: unknown) {
  console.error("Could not refresh the art tree", error);
} finally {
  server.listen(PORT);
}

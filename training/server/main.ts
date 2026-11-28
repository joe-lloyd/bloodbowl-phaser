import { Buffer } from "node:buffer";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import { text } from "node:stream/consumers";
import { trainingEnvironment } from "../boundary/environment";
import { candidateStore } from "./candidates";
import { trainingHandler } from "./handler";
import { toolHandlers } from "./tools";

const MAX_BODY = 1_000_000;
const env = trainingEnvironment();
const REPOSITORY = path.resolve(import.meta.dirname, "../..");
if (
  !path
    .relative(REPOSITORY, path.resolve(env.TRAINING_GROUND_DATA))
    .startsWith("..")
)
  throw new Error("Keep TRAINING_GROUND_DATA outside the repository");
const handle = trainingHandler({
  handlers: toolHandlers(
    candidateStore({ dir: env.TRAINING_GROUND_DATA, now: () => new Date() })
  ),
  root: path.join(REPOSITORY, "dist-training"),
});

function headersOf(message: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(message.headers))
    if (value !== undefined)
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  return headers;
}

async function toRequest(message: IncomingMessage): Promise<Request> {
  const headers = headersOf(message);
  const method = message.method ?? "GET";
  const body =
    method === "GET" || method === "HEAD" ? undefined : await text(message);
  if (body !== undefined && body.length > MAX_BODY)
    throw new Error("The request is too large");
  return new Request(
    new URL(message.url ?? "/", `http://${headers.get("host") ?? "localhost"}`),
    { method, headers, body: body ?? null }
  );
}

async function answer(
  message: IncomingMessage,
  reply: ServerResponse
): Promise<void> {
  try {
    const response = await handle(await toRequest(message));
    reply.writeHead(response.status, Object.fromEntries(response.headers));
    reply.end(Buffer.from(await response.arrayBuffer()));
  } catch (error: unknown) {
    reply.writeHead(400, { "content-type": "text/plain" }).end(String(error));
  }
}

createServer((message, reply) => {
  void answer(message, reply);
}).listen(env.TRAINING_GROUND_PORT, env.TRAINING_GROUND_HOST, () => {
  console.log(
    `Training ground on http://${env.TRAINING_GROUND_HOST}:${String(env.TRAINING_GROUND_PORT)}`
  );
});

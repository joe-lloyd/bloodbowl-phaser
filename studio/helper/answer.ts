import { existsSync, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { CHARACTER_KEY, parseCharacter, parsePreview, type Character, type StudioJob, type StudioState } from "../boundary/studio";
import { createRenderer, previewArgs } from "./blender";
import { checkCharacter, installedModels, prepareReference, readCatalog, readCharacters, rosterPositions, writeCharacter, writeDraft } from "./characterFiles";
import { JobQueue } from "./jobs";
import { DRAFTS, FACTORY, MANIFEST, SPRITES, WORK } from "./paths";
import { publish, refreshTree } from "./publish";
import { run, type OnLine } from "./run";

const MAX_BODY = 200_000;
const TYPES: Readonly<Record<string, string>> = { ".json": "application/json", ".png": "image/png", ".bin": "application/octet-stream" };
const renderer = createRenderer();
const queue = new JobQueue();

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request.setEncoding("utf8")) {
    const bytes = Buffer.from(String(chunk));
    size += bytes.length;
    if (size > MAX_BODY) throw new Error("The request is too large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function state(): Promise<StudioState> {
  return {
    catalog: await readCatalog(),
    characters: readCharacters(),
    positions: rosterPositions(),
    models: installedModels(),
    renderer: renderer.name,
    job: queue.latest,
  };
}

async function exportCharacter(character: Character, onLine: OnLine): Promise<void> {
  const { key } = character;
  await refreshTree();
  await prepareReference();
  writeDraft(character);
  onLine(`Rendering ${key} on ${renderer.name}`);
  const warnings: string[] = [];
  await renderer.layers(key, (line) => {
    onLine(line);
    if (line.startsWith(`WARN ${key} `)) warnings.push(line);
  });
  if (character.looks.kind === "own" && warnings.length > 0) {
    throw new Error("Not installed. A look choice draws nothing of its own or hides part of the base figure. Put the parts it depends on in the same option.");
  }
  await run({ program: "python3", args: ["install_layered.py", path.join(WORK, "layered"), "--characters", DRAFTS, key], cwd: FACTORY, onLine });
  await publish(character, onLine);
}

async function startExport(key: string): Promise<StudioJob> {
  const character = readCharacters().find((saved) => saved.key === key);
  if (!character) throw new Error(`Save ${key} before you export it`);
  checkCharacter(character, await readCatalog());
  return queue.add("export", key, (onLine) => exportCharacter(character, onLine));
}

async function startPreview(request: IncomingMessage): Promise<StudioJob> {
  const { character, ...kit } = parsePreview(await readBody(request));
  checkCharacter(character, await readCatalog());
  return queue.add("preview", character.key, async (onLine) => {
    await prepareReference();
    writeDraft(character);
    await renderer.preview(character.key, previewArgs(character.key, kit), onLine);
  });
}

async function save(request: IncomingMessage): Promise<Character> {
  const character = parseCharacter(await readBody(request));
  checkCharacter(character, await readCatalog());
  writeCharacter(character);
  return character;
}

function findJob(id: string): StudioJob {
  const job = queue.get(id);
  if (!job) throw new Error("The studio restarted, so this job is gone");
  return job;
}

function route(request: IncomingMessage, action: string, id: string): unknown {
  switch (`${request.method ?? "GET"} ${action}`) {
    case "GET state":
      return state();
    case "GET jobs":
      return findJob(id);
    case "PUT characters":
      return save(request);
    case "POST preview":
      return startPreview(request);
    case "POST export":
      return startExport(id);
    default:
      throw new Error(`No studio action ${action}`);
  }
}

function sendFile(response: ServerResponse, file: string): void {
  if (!existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end();
    return;
  }
  const type = TYPES[path.extname(file)] ?? "application/octet-stream";
  response.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(readFileSync(file));
}

export function answerSprite(request: IncomingMessage, response: ServerResponse): void {
  const file = path.join(SPRITES, (request.url ?? "/").split("?")[0] ?? "/");
  sendFile(response, file.startsWith(SPRITES + path.sep) ? file : "");
}

function actionOf(request: IncomingMessage): string[] {
  return (request.url ?? "/").slice(1).split("?")[0]?.split("/") ?? [];
}

export async function answerApi(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const [action = "", id = ""] = actionOf(request);
  if (action === "manifest") {
    sendFile(response, MANIFEST);
    return;
  }
  if (action === "image") {
    sendFile(response, CHARACTER_KEY.test(id) ? path.join(WORK, "preview", `${id}.png`) : "");
    return;
  }
  try {
    const result = JSON.stringify(await route(request, action, id));
    response.writeHead(200, { "content-type": "application/json" }).end(result);
  } catch (error) {
    response.writeHead(400, { "content-type": "text/plain" }).end(error instanceof Error ? error.message : String(error));
  }
}

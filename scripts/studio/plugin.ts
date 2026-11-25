import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";
import { CHARACTER_KEY, parseCharacter, parsePreview, type Character, type StudioJob, type StudioState } from "../../src/boundary/characterStudio";
import { createRenderer, previewArgs } from "./blender";
import {
  checkCharacter,
  installedModels,
  prepareReference,
  readCatalog,
  readCharacters,
  rosterPositions,
  writeCharacter,
  writeDraft,
} from "./characterFiles";
import { JobQueue } from "./jobs";
import { DRAFTS, FACTORY, REPO, WORK } from "./paths";
import { run, type OnLine } from "./run";

const ART = ["public/sprites", "src/game/presentation", "__tests__/fixtures/layered", "scripts/sprites/factory/characters"];
const MAX_BODY = 200_000;
const renderer = createRenderer();
const queue = new JobQueue();

async function readBody(request: IncomingMessage): Promise<string> {
  let text = "";
  for await (const chunk of request) {
    text += String(chunk);
    if (text.length > MAX_BODY) throw new Error("The request is too large");
  }
  return text;
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
  await prepareReference();
  writeDraft(character);
  onLine(`Rendering ${key} on ${renderer.name}`);
  const warnings: string[] = [];
  await renderer.layers(key, (line) => {
    onLine(line);
    if (line.startsWith(`WARN ${key} `)) warnings.push(line);
  });
  if (character.looks.kind === "own" && warnings.length > 0) {
    throw new Error("Not installed. A look choice hides parts of the base figure. Set those parts as a choice in the same option.");
  }
  await run({ program: "python3", args: ["install_layered.py", path.join(WORK, "layered"), "--characters", DRAFTS, key], cwd: FACTORY, onLine });
  onLine("Installed. Changed files:");
  await run({ program: "git", args: ["status", "--short", "--", ...ART], cwd: REPO, onLine });
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

async function save(request: IncomingMessage): Promise<unknown> {
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

function sendPreview(response: ServerResponse, name: string): void {
  const file = path.join(WORK, "preview", `${name}.png`);
  if (!CHARACTER_KEY.test(name) || !existsSync(file)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" }).end(readFileSync(file));
}

function fromThisPage(request: IncomingMessage): boolean {
  if (request.method === "GET") return true;
  return URL.parse(request.headers.origin ?? "")?.host === request.headers.host;
}

async function answer(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const [action = "", id = ""] = (request.url ?? "/").slice(1).split("?")[0]?.split("/") ?? [];
  if (action === "image") {
    sendPreview(response, id);
    return;
  }
  try {
    if (!fromThisPage(request)) throw new Error("The studio only takes changes from its own page");
    const result = JSON.stringify(await route(request, action, id));
    response.writeHead(200, { "content-type": "application/json" }).end(result);
  } catch (error) {
    response.writeHead(400, { "content-type": "text/plain" }).end(error instanceof Error ? error.message : String(error));
  }
}

export function studioPlugin(): Plugin {
  return {
    name: "character-studio",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/studio-api", (request, response) => {
        void answer(request, response);
      });
    },
  };
}

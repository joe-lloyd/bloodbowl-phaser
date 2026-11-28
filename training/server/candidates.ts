import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parseJson } from "../../src/boundary/json";
import {
  DEFAULT_WEIGHTS,
  parseWeightFile,
  weightBounds,
} from "../../src/simulation/ai/weights";
import {
  aboutSchema,
  type Candidate,
  CANDIDATE_ID,
  type CandidateSummary,
  type Layers,
  layersSchema,
  type ToolInput,
  WEIGHT_NAMES,
} from "../boundary/schemas";
import { WEIGHT_INFO } from "../catalogue/weightInfo";
import {
  currentLayers,
  diffLayers,
  LAYERS,
  layerValues,
} from "../catalogue/layers";

interface StoreArgs {
  dir: string;
  now: () => Date;
}

function candidateId(name: string): string {
  const id = name
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replaceAll(/^-+|-+$/g, "");
  if (!CANDIDATE_ID.test(id))
    throw new Error("Give the candidate a name with letters or digits");
  return id;
}

function checkBounds(layers: Layers): void {
  for (const layer of LAYERS) {
    const values = layerValues(layers, layer);
    for (const name of WEIGHT_NAMES) {
      const value = values[name];
      const [low, high] = weightBounds(name);
      if (value !== undefined && (value < low || value > high))
        throw new Error(
          `${WEIGHT_INFO[name].label} (${name}) must be between ${String(low)} and ${String(high)}`
        );
    }
  }
}

function readLayers(file: string): Layers {
  const parsed = parseWeightFile(
    parseJson(readFileSync(file, "utf8"), z.unknown())
  );
  const weights = Object.fromEntries(
    WEIGHT_NAMES.filter(
      (name) => parsed.weights[name] !== DEFAULT_WEIGHTS[name]
    ).map((name) => [name, parsed.weights[name]])
  );
  return layersSchema.parse({
    weights,
    rosters: parsed.rosters,
    gameTypes: parsed.gameTypes,
  });
}

function withCurrent(given: ToolInput<"save_candidate">["layers"]): Layers {
  const current = currentLayers();
  return {
    weights: given.weights,
    rosters: given.rosters ?? current.rosters,
    gameTypes: given.gameTypes ?? current.gameTypes,
  };
}

function refuseRename(taken: string, name: string): void {
  if (taken !== name)
    throw new Error(
      `"${name}" would replace the candidate "${taken}". Pick another name.`
    );
}

export function candidateStore({ dir, now }: StoreArgs) {
  mkdirSync(dir, { recursive: true });
  const weightFile = (id: string) => path.join(dir, `${id}.json`);
  const aboutFile = (id: string) => path.join(dir, `${id}.about.json`);

  const about = (id: string) =>
    existsSync(aboutFile(id))
      ? parseJson(readFileSync(aboutFile(id), "utf8"), aboutSchema)
      : {
          name: id,
          note: "",
          savedAt: statSync(weightFile(id)).mtime.toISOString(),
        };

  const get = (id: string): Candidate => {
    if (!CANDIDATE_ID.test(id) || !existsSync(weightFile(id)))
      throw new Error(`No candidate called ${id}`);
    const layers = readLayers(weightFile(id));
    const diff = diffLayers(currentLayers(), layers);
    return { id, ...about(id), changes: diff.length, layers, diff };
  };

  const list = (): CandidateSummary[] =>
    readdirSync(dir)
      .filter((file) => file.endsWith(".json") && !file.endsWith(".about.json"))
      .map((file) => file.slice(0, -".json".length))
      .filter((id) => CANDIDATE_ID.test(id))
      .map((id) => {
        const { name, note, savedAt, changes } = get(id);
        return { id, name, note, savedAt, changes };
      })
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));

  const save = ({
    name,
    note,
    layers: given,
  }: ToolInput<"save_candidate">): Candidate => {
    const layers = withCurrent(given);
    checkBounds(layers);
    const file = {
      ...layers.weights,
      rosters: layers.rosters,
      gameTypes: layers.gameTypes,
    };
    parseWeightFile(file);
    const id = candidateId(name);
    refuseRename(existsSync(weightFile(id)) ? about(id).name : name, name);
    writeFileSync(weightFile(id), `${JSON.stringify(file, null, 2)}\n`);
    writeFileSync(
      aboutFile(id),
      `${JSON.stringify({ name, note, savedAt: now().toISOString() }, null, 2)}\n`
    );
    return get(id);
  };

  const remove = (id: string): string => {
    get(id);
    rmSync(weightFile(id));
    rmSync(aboutFile(id), { force: true });
    return id;
  };

  return { list, get, save, remove };
}

export type CandidateStore = ReturnType<typeof candidateStore>;

import path from "node:path";
import { fileURLToPath } from "node:url";
import { studioEnvironment } from "../boundary/studio";

const home = studioEnvironment().STUDIO_HOME;
const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const PUBLISHES = home !== undefined;
export const TREE = home === undefined ? here : path.join(home, "tree");
export const FACTORY = path.join(TREE, "scripts/sprites/factory");
export const TREE_CHARACTERS = path.join(FACTORY, "characters");
export const CHARACTERS = home === undefined ? TREE_CHARACTERS : path.join(home, "characters");
export const WORK = path.join(FACTORY, "out/studio");
export const DRAFTS = path.join(WORK, "drafts");
export const MANIFEST = path.join(TREE, "src/game/presentation/spriteManifest.json");
export const SPRITES = path.join(TREE, "public/sprites");

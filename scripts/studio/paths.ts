import path from "node:path";

export const REPO = path.resolve(import.meta.dirname, "../..");
export const FACTORY = path.join(REPO, "scripts/sprites/factory");
export const CHARACTERS = path.join(FACTORY, "characters");
export const WORK = path.join(FACTORY, "out/studio");
export const DRAFTS = path.join(WORK, "drafts");
export const MANIFEST = path.join(REPO, "src/game/presentation/spriteManifest.json");

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MATCH_STYLE } from "../../src/game/presentation/matchStyle";
import { createHeadlessGame } from "../../src/headless/createHeadlessGame";
import { createMatchSave, MatchSave } from "../../src/headless/serialization";
import { SCENARIOS } from "../../src/data/scenarios";
import { resolveMatchStart } from "../../src/scenes/matchStart";

const PUBLIC = join(__dirname, "../../public");

/**
 * There is one match look, the Blood Bowl stadium. The Neon style is gone,
 * but saves and lobbies written while it existed still name it.
 */
describe("the match style", () => {
  it("draws the Blood Bowl stadium and sprites, which ship in public/", () => {
    expect(MATCH_STYLE.stadiumPath).toBe("/stadium/bloodbowl");
    expect(MATCH_STYLE.spritePath).toBe("/sprites/bloodbowl");
    for (const file of [
      "meta.json",
      "base.webp",
      "home.webp",
      "away.webp",
      "preview.webp",
    ]) {
      expect(existsSync(join(PUBLIC, MATCH_STYLE.stadiumPath, file))).toBe(
        true
      );
    }
    expect(existsSync(join(PUBLIC, MATCH_STYLE.spritePath))).toBe(true);
  });

  it("ships no other stadium or sprite set", () => {
    expect(readdirSync(join(PUBLIC, "stadium"))).toEqual(["bloodbowl"]);
    expect(readdirSync(join(PUBLIC, "sprites"))).toEqual(["bloodbowl"]);
  });

  it("resumes a save written in the Neon style, and saves it without one", () => {
    const scenario = SCENARIOS.find((s) => s.id === "basic-scrimmage")!;
    const game = createHeadlessGame({ scenario, seed: 5 });
    const save = createMatchSave({
      state: game.gameService.getState(),
      teams: [game.team1, game.team2],
      drive: {
        kickingTeamId: game.team2.id,
        receivingTeamId: game.team1.id,
      },
      rng: game.rng.captureState(),
      matchStats: game.matchStats.captureState(),
    });
    expect(save).not.toHaveProperty("presentation");

    // What an autosave from before looked like, round-tripped through JSON
    const legacy = JSON.parse(
      JSON.stringify({ ...save, presentation: { pitchThemeId: "neon" } })
    ) as MatchSave;
    const start = resolveMatchStart(
      { team1: game.team1, team2: game.team2, resumeSave: legacy },
      "GameScene"
    );

    expect(start.resumed).toBe(true);
    expect(start.team1.id).toBe(game.team1.id);
    expect(start.kickingTeam.id).toBe(game.team2.id);
    expect(start).not.toHaveProperty("pitchThemeId");
  });
});

import { describe, expect, it } from "vitest";
import { RosterName } from "../../src/types/Team";
import { Inducement } from "../../src/types/Inducements";
import { createSimGame, runMatch } from "../../src/simulation/runMatch";
import { randomCoach } from "../../src/simulation/coaches/random";
import type { GameType } from "../../src/game/variants/gameTypes";

async function freeItemsWithoutInducements(gameType: GameType) {
  const rosters = [RosterName.HUMAN, RosterName.ORC] as const;
  const game = createSimGame(3, [...rosters], 3, "sevens-lineup", gameType);
  await runMatch({
    seed: 3,
    rosters: [...rosters],
    coaches: [randomCoach, randomCoach],
    game,
    inducements: false,
    maxCommands: 1,
  });
  return (game.ctx.gameService.getState().inducements?.inventory ?? []).map(
    ({ inducement, ownerTeamId, provenance }) => ({
      inducement,
      ownerTeamId,
      provenance,
    })
  );
}

describe("a simulated match that buys no inducements", () => {
  it("still gives each Street Bowl team its free Magic Potion (SB-D5)", async () => {
    expect(await freeItemsWithoutInducements("street-bowl")).toEqual([
      {
        inducement: Inducement.MAGIC_POTION,
        ownerTeamId: "team1",
        provenance: "free",
      },
      {
        inducement: Inducement.MAGIC_POTION,
        ownerTeamId: "team2",
        provenance: "free",
      },
    ]);
  });

  it("gives a Sevens team nothing", async () => {
    expect(await freeItemsWithoutInducements("sevens")).toEqual([]);
  });
});

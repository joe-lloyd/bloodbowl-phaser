import { describe, expect, it } from "vitest";
import { settleDraftOffers } from "../../../src/competition/computerTeams";
import {
  createComputerTeamFromTemplate,
  getComputerTeamTemplates,
} from "../../../src/competition/computerTeamTemplates";
import {
  draftedPlayerPrice,
  rollDraftOffers,
} from "../../../src/game/progression/advancementModes";
import { fixtureValue } from "../../../src/testing/fixtureValue";
import type { PlayerAdvancement } from "../../../src/types/Player";

const block: PlayerAdvancement = {
  id: "adv-block",
  type: "primary-skill",
  name: "Block",
  sppCost: 6,
  valueIncrease: 20_000,
};

describe("settling a computer club's pro offers before its redraft", () => {
  it("pays to keep the offers it can afford and spends nothing else", () => {
    const template = fixtureValue(getComputerTeamTemplates()[0]);
    const team = createComputerTeamFromTemplate(template.id, {
      advancementMode: "advanced-league",
    });
    const [kept, lost] = team.players;
    for (const player of [kept, lost]) fixtureValue(player).advancements = [block];
    team.treasury = draftedPlayerPrice(fixtureValue(kept)) + 1000;
    rollDraftOffers(team, { rollDie: () => 1 }, "season-1");
    const players = team.players.length;

    settleDraftOffers(team);

    expect(team.pendingDevelopment ?? []).toEqual([]);
    expect(team.treasury).toBe(1000);
    expect(team.players.map((player) => player.id)).toContain(fixtureValue(kept).id);
    expect(team.players.map((player) => player.id)).not.toContain(fixtureValue(lost).id);
    expect(team.players).toHaveLength(players - 1);
  });
});

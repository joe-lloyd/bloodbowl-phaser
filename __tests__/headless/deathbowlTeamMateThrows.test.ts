import { describe, expect, it } from "vitest";
import type { HeadlessGame } from "../../src/headless/HeadlessGame";
import type { Player } from "../../src/types/Player";
import { getSkill, SkillType } from "../../src/types/Skills";
import { northWithBallsAside, stand, stateOf } from "../utils/deathbowlGame";

async function throwerBesideMate(skills: readonly SkillType[]) {
  const game = await northWithBallsAside();
  const thrower = stand(game, ["seat0", 0], { at: { x: 10, y: 8 } });
  const mate = stand(game, ["seat0", 1], { at: { x: 11, y: 8 } });
  thrower.skills.push(...skills.map((skill) => getSkill(skill)));
  mate.skills.push(getSkill(SkillType.RIGHT_STUFF));
  mate.stats.ST = 2;
  return { game, thrower, mate };
}

async function actionsOf(game: HeadlessGame, player: Player) {
  const response = await game.execute({ type: "legal-actions", playerId: player.id });
  return response.legalActions?.players.find(({ playerId }) => playerId === player.id)?.actions;
}

describe("Throw Team-mate uses a Pass action, Kick Team-mate does not (DB-A1)", () => {
  it("lets a player with both skills Kick a team-mate once both Passes are spent", async () => {
    const { game, thrower, mate } = await throwerBesideMate([SkillType.THROW_TEAM_MATE, SkillType.KICK_TEAM_MATE]);
    stateOf(game).turn.spend = { ...stateOf(game).turn.spend, passes: 2 };

    const declared = await game.execute({ type: "declare-action", playerId: thrower.id, action: "throwTeamMate" });
    await game.execute({
      type: "throw-teammate",
      throwerId: thrower.id,
      teammateId: mate.id,
      x: 13,
      y: 8,
      mode: "kick",
    });

    expect(declared).toMatchObject({ ok: true });
    expect(stateOf(game).turn.hasKickedTeamMate).toBe(true);
    expect(stateOf(game).turn.spend.passes).toBe(2);
  });

  it("offers no Throw Team-mate when the only team-mate beside the thrower was thrown this turn", async () => {
    const { game, thrower, mate } = await throwerBesideMate([SkillType.THROW_TEAM_MATE]);
    expect(await actionsOf(game, thrower)).toContain("throwTeamMate");

    stateOf(game).turn.spend = { ...stateOf(game).turn.spend, passes: 1, thrownIds: [mate.id] };

    expect(await actionsOf(game, thrower)).not.toContain("throwTeamMate");
  });
});

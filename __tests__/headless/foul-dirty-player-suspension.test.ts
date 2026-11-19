import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { forceDice } from "../utils/test-helpers";

describe("a Foul's Dirty Player across the armour-broken wait", () => {
  it("keeps the +1 it decided on before the wait", async () => {
    const game = new HeadlessGame({
      seed: 1,
      scenario: {
        id: "foul-dirty-player-suspension",
        name: "foul-dirty-player-suspension",
        description: "",
        setup: {
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.DIRTY_PLAYER] },
          ],
          team2Placements: [
            {
              playerIndex: 0,
              x: 11,
              y: 5,
              status: PlayerStatus.PRONE,
              stats: { AV: 9 },
            },
          ],
          activeTeam: "team1",
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
          ballPosition: { x: 1, y: 1 },
        },
      },
    });
    const fouler = game.ctx.team1.players[0];
    vi.spyOn(game.ctx.rng, "rollDie").mockReturnValue(1);

    forceDice(game.ctx.rng, [5, 6, 3, 4]);
    const context = game.ctx.gameService.flowManager.context;
    const delay = context.delay;
    context.delay = (ms) => {
      if (ms === 800) {
        fixtureValue(fouler).skills = fixtureValue(fouler).skills.filter(
          (skill) => skill.type !== SkillType.DIRTY_PLAYER
        );
      }
      return delay(ms);
    };

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(fouler).id,
      action: "foul",
    });
    const response = await game.execute({
      type: "foul",
      playerId: fixtureValue(fouler).id,
      x: 11,
      y: 5,
    });

    const told = response.events.flatMap(({ name, data }) => {
      if (name === GameEventNames.SkillTriggered)
        return [
          `skill: ${z.object({ effect: z.string() }).parse(data).effect}`,
        ];
      if (name === GameEventNames.DiceRoll)
        return [
          `dice: ${z.object({ description: z.string() }).parse(data).description}`,
        ];
      if (name === GameEventNames.UI_Notification)
        return [`note: ${String(data)}`];
      return [];
    });
    expect(told).toEqual([
      "note: Human Lineman #1 is fouling Human Lineman #1!",
      "note: Assists: +0 Offensive, -0 Defensive. Mod: +0",
      "dice: Foul Armour Roll (Human Lineman #1): 5 + 6 = 11 (AV 9+)",
      "note: ARMOUR BROKEN!",
      "dice: Injury Roll (Human Lineman #1): 3 + 4 = 7",
      "skill: Dirty Player: +1 to the Injury Roll",
      "note: Injury Roll for Human Lineman #1",
      "note: KNOCKED OUT!",
    ]);
  });
});

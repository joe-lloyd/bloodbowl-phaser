import { describe, expect, it } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { GameConfig } from "../../src/config/GameConfig";
import { SkillType } from "../../src/types/Skills";
import { GameEventNames } from "../../src/types/events";
import { acceptAll, playOut, turnGame } from "./eventOrder/eventOrder";

describe("On the Ball beside the touchline, the squares towards the pass taken", () => {
  it("steps only onto squares of the Sevens pitch", async () => {
    const game = turnGame({
      seed: 1,
      team1: [
        { x: 6, y: 5 },
        { x: 14, y: 4 },
      ],
      team2: [
        { x: 12, y: 10, skills: [SkillType.ON_THE_BALL] },
        { x: 11, y: 9 },
        { x: 12, y: 9 },
        { x: 13, y: 9 },
        { x: 11, y: 10 },
        { x: 13, y: 10 },
      ],
      ballPosition: { x: 6, y: 5 },
    });
    const passer = fixtureValue(game.ctx.teams[0].players[0]);
    const reactor = fixtureValue(game.ctx.teams[1].players[0]);
    const steps: { x: number; y: number }[] = [];
    game.ctx.eventBus.on(GameEventNames.PlayerMoved, ({ playerId, to }) => {
      if (playerId === reactor.id) steps.push(to);
    });
    const events = await playOut(
      game,
      [
        { type: "declare-action", playerId: passer.id, action: "pass" },
        { type: "pass", playerId: passer.id, x: 14, y: 4 },
      ],
      acceptAll
    );
    const offPitch = steps.filter(
      (s) => s.x >= GameConfig.PITCH_WIDTH || s.y >= GameConfig.PITCH_HEIGHT
    );
    const triggered = events.some((e) =>
      e.startsWith("skillTriggered: On the Ball")
    );
    expect({ triggered, offPitch }).toEqual({ triggered: true, offPitch: [] });
  });
});

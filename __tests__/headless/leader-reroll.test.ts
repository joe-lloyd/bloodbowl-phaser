import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { PlayerStatus } from "../../src/types/Player";
import { movePlayerToBox } from "../../src/game/rules/playerLocation";
import {
  deserializeGameState,
  serializeGameState,
} from "../../src/headless/serialization";

/**
 * Leader, 2025 rulebook p.130: "A team can only use a Leader Re-roll if
 * they have a player with the Leader Skill on the pitch, and if all players
 * with this Skill are removed from play, either as a Casualty or by of being
 * Sent-off, before the Leader Re-roll is used then it is lost." A Knocked
 * Out Leader only makes it unusable until they return; the bank used to be
 * wiped the first time the Leader was seen off the pitch. The team has no
 * Team Re-rolls, so any re-roll offered is the Leader's. Seed 8 fails the
 * Hypnotic Gaze with a 1 (committed, never searched).
 */
const GAZE_FAILS_SEED = 8;

const scenario: Scenario = {
  id: "leader-reroll",
  name: "Leader Re-roll after a Knocked Out Leader",
  description: "the Leader is Knocked Out, comes back, and the bank remains",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 10, y: 5, skills: [SkillType.HYPNOTIC_GAZE] },
      { playerIndex: 1, x: 5, y: 5, skills: [SkillType.LEADER] },
    ],
    team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

async function failGaze(game: HeadlessGame) {
  const gazer = game.ctx.team1.players[0];
  await game.execute({
    type: "declare-action",
    playerId: gazer.id,
    action: "gaze",
  });
  return game.execute({
    type: "special-action",
    action: "gaze",
    attackerId: gazer.id,
    defenderId: game.ctx.team2.players[0].id,
  });
}

describe("Leader Re-roll", () => {
  it("survives the Leader being Knocked Out and returning", async () => {
    const game = new HeadlessGame({ scenario, seed: GAZE_FAILS_SEED });
    game.ctx.team1.rerolls = 0;
    const leader = game.ctx.team1.players[1];
    const arbiter = game.ctx.gameService.getRerollArbiter();

    movePlayerToBox(leader, { box: "ko" });
    expect(arbiter.teamRerollAvailable(game.ctx.team1.id)).toBe(false);

    leader.gridPosition = { x: 5, y: 5 };
    leader.status = PlayerStatus.ACTIVE;
    const gazed = await failGaze(game);

    expect(gazed.pendingDecision).toMatchObject({
      type: "reroll",
      sources: ["team"],
    });
  });

  it("is lost once the only Leader is a Casualty", async () => {
    const game = new HeadlessGame({ scenario, seed: GAZE_FAILS_SEED });
    game.ctx.team1.rerolls = 0;
    movePlayerToBox(game.ctx.team1.players[1], { box: "casualty" });

    const gazed = await failGaze(game);

    expect(gazed.pendingDecision).toBeNull();
  });

  it("stays spent across a save and restore", async () => {
    const game = new HeadlessGame({ scenario, seed: GAZE_FAILS_SEED });
    game.ctx.team1.rerolls = 0;
    await failGaze(game);
    await game.execute({ type: "use-reroll", accept: true, source: "team" });

    const restored = deserializeGameState(
      serializeGameState(game.ctx.gameService.getState(), [
        game.ctx.team1,
        game.ctx.team2,
      ])
    );

    expect(restored.leaderRerolls).toEqual({ half: "h1", teamIds: [] });
  });
});

import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { Scenario } from "../../src/types/Scenario";
import {
  Player,
  PlayerCondition,
  PlayerStatus,
  addCondition,
} from "../../src/types/Player";
import { SkillType, getSkill } from "../../src/types/Skills";
import { GameEventNames } from "../../src/types/events";
import { forceDice } from "../utils/test-helpers";

/**
 * Rulebook p.125: an Active skill or trait works only while its holder is
 * Standing and not Distracted; a Passive one is always in effect. FAQ (May
 * 2026), p3: a Distracted player cannot use Dodge against a Stumble, nor
 * Block on a Both Down, nor benefit a team-mate with Pick-me-up.
 */
const scenario: Scenario = {
  id: "distracted-active-skills",
  name: "Distracted active skills",
  description: "attacker blocks a defender",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
    team2Placements: [
      { playerIndex: 0, x: 11, y: 5 },
      { playerIndex: 1, x: 13, y: 7 },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

const stumble = { type: "pow-dodge" as const, icon: "", label: "Stumble" };
const bothDown = { type: "both-down" as const, icon: "", label: "Both Down" };

function setUp(skill: SkillType, distracted: boolean) {
  const game = new HeadlessGame({ scenario, seed: 5 });
  const attacker = game.ctx.team1.players[0];
  const defender = game.ctx.team2.players[0];
  defender.skills = [...defender.skills, getSkill(skill)];
  if (distracted) addCondition(defender, PlayerCondition.DISTRACTED);
  return { game, attacker, defender };
}

async function resolve(
  game: HeadlessGame,
  attacker: Player,
  defender: Player,
  result: typeof stumble | typeof bothDown
) {
  // Armour holds: the knocked-down defender stays Prone
  forceDice(game.ctx.rng, [1, 1, 1, 1]);
  await game.ctx.gameService.resolveBlock(attacker.id, defender.id, result);
  if (game.pendingDecision()?.type === "push-direction") {
    await game.execute({ type: "choose-push-direction", x: 12, y: 5 });
  }
  if (game.pendingDecision()?.type === "follow-up") {
    await game.execute({ type: "choose-follow-up", followUp: false });
  }
}

describe("Distracted players cannot use Active skills", () => {
  it("a Standing Dodge player treats a Stumble as a Push", async () => {
    const { game, attacker, defender } = setUp(SkillType.DODGE, false);
    await resolve(game, attacker, defender, stumble);
    expect(defender.gridPosition).toEqual({ x: 12, y: 5 });
    expect(defender.status).toBe(PlayerStatus.ACTIVE);
  });

  it("a Distracted Dodge player is Knocked Down by a Stumble", async () => {
    const { game, attacker, defender } = setUp(SkillType.DODGE, true);
    await resolve(game, attacker, defender, stumble);
    expect(defender.gridPosition).toEqual({ x: 12, y: 5 });
    expect(defender.status).toBe(PlayerStatus.PRONE);
  });

  it("a Distracted Block player is Knocked Down on a Both Down", async () => {
    const { game, attacker, defender } = setUp(SkillType.BLOCK, true);
    await resolve(game, attacker, defender, bothDown);
    expect(attacker.status).toBe(PlayerStatus.PRONE);
    expect(defender.status).toBe(PlayerStatus.PRONE);
  });

  it("a Distracted Pick-me-up player stands no team-mate up", async () => {
    for (const distracted of [false, true]) {
      const game = new HeadlessGame({ scenario, seed: 5 });
      const [holder, mate] = game.ctx.team2.players;
      holder.skills = [...holder.skills, getSkill(SkillType.PICK_ME_UP)];
      if (distracted) addCondition(holder, PlayerCondition.DISTRACTED);
      mate.status = PlayerStatus.PRONE;

      forceDice(game.ctx.rng, [6]);
      await game.execute({ type: "end-turn" });
      expect(mate.status).toBe(
        distracted ? PlayerStatus.PRONE : PlayerStatus.ACTIVE
      );
    }
  });

  it("a Distracted player's Passive Foul Appearance still applies", async () => {
    const { game, attacker, defender } = setUp(
      SkillType.FOUL_APPEARANCE,
      true
    );
    await game.execute({
      type: "declare-action",
      playerId: attacker.id,
      action: "block",
    });
    forceDice(game.ctx.rng, [1]);
    const response = await game.execute({
      type: "block",
      attackerId: attacker.id,
      defenderId: defender.id,
    });
    expect(response.pendingDecision).toBeNull();
    expect(
      response.events
        .filter((event) => event.name === GameEventNames.SkillTriggered)
        .map((event) => event.data)
    ).toEqual([
      {
        playerId: defender.id,
        skill: SkillType.FOUL_APPEARANCE,
        effect: "Foul Appearance: the block is cancelled",
      },
    ]);
    expect(defender.status).toBe(PlayerStatus.ACTIVE);
  });
});

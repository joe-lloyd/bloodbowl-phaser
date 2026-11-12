import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import {
  PlayerCondition,
  PlayerStatus,
  hasTackleZone,
} from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";
import { GameEventNames } from "../../src/types/events";

/**
 * Bloodlust (X+), 2025 rulebook p.125: a player who fails the roll and does
 * not bite a Thrall Lineman "for any reason" causes a Turnover and becomes
 * Distracted (no Tackle Zone until they are next activated). Clicking End
 * Turn with the bite still owed is one of those reasons: it must not let
 * the player walk away from the penalty.
 *
 * Seed 7 fails the Bloodlust (2+) roll with a natural 1 and seed 1 passes it
 * with a 4 (both committed, never searched at run time).
 */
const FAILS = 7;
const PASSES = 1;

interface Setup {
  /** A Thrall Lineman beside the Bloodlust player, so a bite is possible. */
  thrall?: boolean;
  /** A team-mate still to activate, so this is not the team's last player. */
  teammate?: boolean;
  seed?: number;
}

function start({ thrall = false, teammate = false, seed = FAILS }: Setup) {
  const scenario: Scenario = {
    id: "bloodlust-end-turn",
    name: "Bloodlust fails and the coach ends the turn",
    description: "a failed Bloodlust activation is cut short by End Turn",
    setup: {
      team1Roster: RosterName.VAMPIRE,
      team1Placements: [
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          skills: [{ type: SkillType.BLOODLUST, parameter: "2+" }],
        },
        ...(thrall ? [{ playerIndex: 1, x: 11, y: 5 }] : []),
        ...(teammate ? [{ playerIndex: 2, x: 3, y: 9 }] : []),
      ],
      team2Placements: [{ playerIndex: 0, x: 18, y: 2 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  };
  const game = new HeadlessGame({ scenario, seed });
  const vampire = game.ctx.team1.players[0];
  const thrallPlayer = game.ctx.team1.players[1];
  let turnovers = 0;
  let penalties = 0;
  game.ctx.eventBus.on(GameEventNames.Turnover, () => turnovers++);
  game.ctx.eventBus.on(GameEventNames.SkillTriggered, (e) => {
    if (e.skill === SkillType.BLOODLUST && /bit nobody/.test(e.effect ?? ""))
      penalties++;
  });
  return {
    game,
    vampire,
    thrall: thrallPlayer,
    team1: game.ctx.team1.id,
    team2: game.ctx.team2.id,
    turnovers: () => turnovers,
    penalties: () => penalties,
  };
}

/** Declare a Move, keep it if the roll fails, and leave the bite unresolved. */
async function declareMove(r: ReturnType<typeof start>) {
  const declared = await r.game.execute({
    type: "declare-action",
    playerId: r.vampire.id,
    action: "move",
  });
  // A failed roll offers the downgrade to a Move; the Move is kept.
  if (declared.pendingDecision?.type === "reaction") {
    await r.game.execute({ type: "use-reaction", accept: false });
  }
  return declared;
}

const conditions = (r: ReturnType<typeof start>) =>
  (r.vampire.conditions ?? []).map((c) => c.type);

describe("End Turn with a failed Bloodlust bite still owed", () => {
  it("on the team's last player: Distracted, a Turnover, and no Tackle Zone into the next turn", async () => {
    const r = start({});
    await declareMove(r);

    const ended = await r.game.execute({ type: "end-turn" });

    expect(ended.pendingDecision).toBeNull();
    expect(r.game.snapshot().activeTeamId).toBe(r.team2);
    expect(conditions(r)).toEqual([PlayerCondition.DISTRACTED]);
    expect(hasTackleZone(r.vampire)).toBe(false);
    expect(r.turnovers()).toBe(1);
    expect(r.penalties()).toBe(1);
  });

  it("keeps the penalty through the opponent's turn and lifts it when the player is next activated", async () => {
    const r = start({});
    await declareMove(r);
    await r.game.execute({ type: "end-turn" });

    // The opponent's turn passes without the Distracted player marking anyone
    await r.game.execute({ type: "end-turn" });
    expect(r.game.snapshot().activeTeamId).toBe(r.team1);
    expect(conditions(r)).toEqual([PlayerCondition.DISTRACTED]);
    expect(hasTackleZone(r.vampire)).toBe(false);

    // "Distracted ... until they are next activated"
    await r.game.execute({
      type: "declare-action",
      playerId: r.vampire.id,
      action: "move",
    });
    expect(conditions(r)).not.toContain(PlayerCondition.DISTRACTED);
  });

  it("does not depend on being the last player: a team-mate still to activate changes nothing", async () => {
    const r = start({ teammate: true });
    await declareMove(r);

    await r.game.execute({ type: "end-turn" });

    expect(r.game.snapshot().activeTeamId).toBe(r.team2);
    expect(conditions(r)).toEqual([PlayerCondition.DISTRACTED]);
    expect(hasTackleZone(r.vampire)).toBe(false);
    expect(r.turnovers()).toBe(1);
    expect(r.penalties()).toBe(1);
  });

  it("matches explicitly ending the activation first, and settles the penalty once", async () => {
    const skipped = start({ teammate: true });
    await declareMove(skipped);
    // Ending the activation settles the bite; refusing it is a Turnover,
    // which ends the turn by itself
    await skipped.game.execute({
      type: "end-activation",
      playerId: skipped.vampire.id,
    });

    const ended = start({ teammate: true });
    await declareMove(ended);
    await ended.game.execute({ type: "end-turn" });

    for (const r of [skipped, ended]) {
      expect(r.game.snapshot().activeTeamId).toBe(r.team2);
      expect(conditions(r)).toEqual([PlayerCondition.DISTRACTED]);
      expect(r.turnovers()).toBe(1);
      expect(r.penalties()).toBe(1);
    }
  });

  it("offers the bite first; a bite settles it with no penalty and the turn still ends", async () => {
    const r = start({ thrall: true });
    await declareMove(r);

    const ended = await r.game.execute({ type: "end-turn" });
    expect(ended.pendingDecision).toMatchObject({
      type: "reaction",
      playerId: r.vampire.id,
      skill: SkillType.BLOODLUST,
    });
    await r.game.execute({ type: "use-reaction", accept: true });

    expect(r.thrall.status).not.toBe(PlayerStatus.ACTIVE);
    expect(conditions(r)).toEqual([]);
    expect(hasTackleZone(r.vampire)).toBe(true);
    expect(r.turnovers()).toBe(0);
    expect(r.game.snapshot().activeTeamId).toBe(r.team2);
  });

  it("declining the offered bite at End Turn is the full penalty", async () => {
    const r = start({ thrall: true });
    await declareMove(r);

    await r.game.execute({ type: "end-turn" });
    await r.game.execute({ type: "use-reaction", accept: false });

    expect(r.thrall.status).toBe(PlayerStatus.ACTIVE);
    expect(conditions(r)).toEqual([PlayerCondition.DISTRACTED]);
    expect(r.turnovers()).toBe(1);
    expect(r.game.snapshot().activeTeamId).toBe(r.team2);
  });

  it("a passed Bloodlust roll owes nothing: End Turn just ends the turn", async () => {
    const r = start({ thrall: true, seed: PASSES });
    const declared = await declareMove(r);
    expect(
      declared.events
        .filter((e) => e.name === "diceRoll")
        .map((e) => (e.data as { description: string }).description)
    ).toEqual(["Bloodlust (Thrall Lineman #1): 4, needs 2+"]);

    const ended = await r.game.execute({ type: "end-turn" });

    expect(ended.pendingDecision).toBeNull();
    expect(conditions(r)).toEqual([]);
    expect(r.thrall.status).toBe(PlayerStatus.ACTIVE);
    expect(r.turnovers()).toBe(0);
    expect(r.penalties()).toBe(0);
    expect(r.game.snapshot().activeTeamId).toBe(r.team2);
  });
});

import { describe, expect, it } from "vitest";
import { RosterName } from "../../src/types/Team";
import { runMatch } from "../../src/simulation/runMatch";
import { plannerCoach } from "../../src/simulation/ai/planner";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType, getSkill } from "../../src/types/Skills";
import { Player } from "../../src/types/Player";
import { chain } from "../../src/simulation/ai/chance";
import { enumerateDecision } from "../../src/simulation/candidates";
import { createCoachRng } from "../../src/simulation/rng";

/**
 * Seen in a browser match with no team re-rolls: the carrier set off on a
 * scoring run, took one step, and then stepped back, because the rest of
 * the run was still below the safe-score line and a step off the sideline
 * ranked first. It did that three turns running. In this seeded match the
 * old planner did the same; a run that is still worth making is finished.
 */
describe("the planner's scoring run", () => {
  it("never abandons a run it has started for a carrier step", async () => {
    const recording = await runMatch({
      seed: 10,
      rerolls: 0,
      inducements: false,
      rosters: [RosterName.ORC, RosterName.HUMAN],
      coaches: [plannerCoach, heuristicCoach],
    });
    const abandoned = recording.steps.filter(
      (step, i) =>
        i > 0 &&
        step.command.type === "move" &&
        step.note?.startsWith("moves the ball carrier") &&
        recording.steps[i - 1].command.type === "move" &&
        recording.steps[i - 1].note?.startsWith("runs in to score")
    );
    expect(abandoned.map((step) => step.label)).toEqual([]);
  }, 60_000);
});

describe("the planner's touchback", () => {
  it("gives the ball to a ball handler, not a player who may refuse to act", async () => {
    const game = new HeadlessGame({
      scenario: {
        id: "planner-touchback",
        name: "Planner touchback",
        description: "",
        setup: {
          team1Placements: [
            { playerIndex: 0, x: 3, y: 5, skills: [SkillType.REALLY_STUPID] },
            { playerIndex: 1, x: 2, y: 2 },
          ],
          team2Placements: [{ playerIndex: 0, x: 15, y: 5 }],
          activeTeam: "team1",
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
        },
      },
      seed: 1,
    });
    game.adoptPending({ type: "touchback", teamId: game.ctx.team1.id });
    const point = await enumerateDecision(game, null);
    const { index } = await plannerCoach.choose({
      game,
      snapshot: game.snapshot(),
      point,
      rng: createCoachRng(1),
    });
    expect(point.candidates[index].commands[0]).toEqual({
      type: "touchback",
      playerId: game.ctx.team1.players[1].id,
    });
  });
});

describe("the planner's dice maths", () => {
  it("does not re-roll a skill-re-rolled roll again with a team re-roll", () => {
    const dodger = { skills: [getSkill(SkillType.DODGE)] } as Player;
    // A 3+ dodge re-rolled once: 2/3 + 1/3 * 2/3.
    expect(chain(dodger, [{ kind: "dodge", target: 3 }], true)).toBeCloseTo(
      8 / 9,
      6
    );
  });
});

describe("the planner's skill re-roll", () => {
  it("is still there for the second dodge if the first one passes", () => {
    const dodger = { skills: [getSkill(SkillType.DODGE)] } as Player;
    const dodges = [
      { kind: "dodge", target: 3 },
      { kind: "dodge", target: 3 },
    ] as const;
    // Both pass, or either fails and its one re-roll passes.
    expect(chain(dodger, dodges, false)).toBeCloseTo(20 / 27, 6);
  });
});

describe("the planner's block re-roll", () => {
  it("re-rolls uphill dice when the defender could take a Skull", async () => {
    const game = new HeadlessGame({
      scenario: {
        id: "planner-uphill",
        name: "Planner uphill",
        description: "",
        setup: {
          team1Placements: [{ playerIndex: 0, x: 7, y: 5 }],
          team2Placements: [{ playerIndex: 0, x: 8, y: 5 }],
          activeTeam: "team1",
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
        },
      },
      seed: 1,
    });
    const die = (type: "pow" | "skull") => ({ type, icon: "", label: type });
    game.adoptPending({
      type: "block-dice",
      attackerId: game.ctx.team1.players[0].id,
      defenderId: game.ctx.team2.players[0].id,
      chooserTeamId: game.ctx.team2.id,
      options: [die("pow"), die("skull")],
      choiceStage: "attacker-reroll",
      teamRerollAvailable: true,
    });
    const point = await enumerateDecision(game, null);
    const { index } = await plannerCoach.choose({
      game,
      snapshot: game.snapshot(),
      point,
      rng: createCoachRng(1),
    });
    expect(point.candidates[index].commands[0].type).toBe("team-reroll-block");
  });
});

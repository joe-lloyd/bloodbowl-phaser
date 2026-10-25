import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario, PlayerPlacement } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";

/**
 * A Jump is an Agility Test like a Dodge: a failed one may be re-rolled,
 * and the skills that name Jump or Leap reach it. Prehensile Tail ("Dodge,
 * Jump or Leap away from a square in this player's Tackle Zone"), Diving
 * Tackle ("as a result of a Dodge, Leap or Jump") and Tentacles ("Dodge,
 * Jump or Leap away") all bite a jumper leaving their Tackle Zone. The
 * engine rolled the Jump once, with no offer and no marker skills.
 *
 * The lineman at (10,5) jumps the Prone opponent at (11,5) into (12,5).
 * The marker stands at (9,6): it Marks the square being left, not the
 * target.
 */
function scenario(marker: PlayerPlacement | null): Scenario {
  return {
    id: "jump-markers",
    name: "Jump away from a marker",
    description: "a lineman jumps a Prone opponent, leaving a marker behind",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 10, y: 5 },
        { playerIndex: 1, x: 1, y: 9 },
      ],
      team2Placements: [
        { playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE },
        marker ?? { playerIndex: 1, x: 20, y: 1 },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  };
}

async function jump(game: HeadlessGame) {
  const jumper = game.snapshot().teams[0].players[0].id;
  await game.execute({ type: "declare-action", playerId: jumper, action: "move" });
  return game.execute({ type: "jump", playerId: jumper, x: 12, y: 5 });
}

function diceOf(events: { name: string; data: unknown }[]): string[] {
  return events
    .filter((e) => e.name === "diceRoll")
    .map((e) => (e.data as { description: string }).description);
}

describe("a Jump Agility Test", () => {
  it("offers a team re-roll when it fails", async () => {
    const game = new HeadlessGame({ scenario: scenario(null), seed: 9 });
    game.ctx.team1.rerolls = 3;

    const first = await jump(game);
    expect(diceOf(first.events)).toEqual([
      "Jump (Human Lineman #1): 2 +0 = 2 (Target: 3+)",
    ]);
    expect(first.pendingDecision).toMatchObject({
      type: "reroll",
      rollKind: "jump",
      sources: ["team"],
    });

    const second = await game.execute({ type: "use-reroll", accept: true });
    expect(diceOf(second.events)).toEqual([
      "Jump (Human Lineman #1): 6 +0 = 6 (Target: 3+)",
    ]);
    expect(game.ctx.team1.players[0].gridPosition).toEqual({ x: 12, y: 5 });
    expect(game.ctx.team1.players[0].status).toBe(PlayerStatus.ACTIVE);
  });
});

describe("skills of a marker the jumper leaves", () => {
  it("Prehensile Tail adds -1 to the Jump", async () => {
    const game = new HeadlessGame({
      scenario: scenario({
        playerIndex: 1,
        x: 9,
        y: 6,
        skills: [SkillType.PREHENSILE_TAIL],
      }),
      seed: 1,
    });

    const response = await jump(game);

    expect(diceOf(response.events)).toEqual([
      "Jump (Human Lineman #1): 4 -2 = 2 (Target: 3+)",
      "Armour Roll (Human Lineman #1): 1 + 4 = 5",
    ]);
    expect(game.ctx.team1.players[0].status).toBe(PlayerStatus.PRONE);
  });

  it("Diving Tackle turns a pass into a fall and drops the diver in the vacated square", async () => {
    const game = new HeadlessGame({
      scenario: scenario({
        playerIndex: 1,
        x: 9,
        y: 6,
        skills: [SkillType.DIVING_TACKLE],
      }),
      seed: 2,
    });

    const first = await jump(game);
    expect(diceOf(first.events)).toEqual([
      "Jump (Human Lineman #1): 5 -1 = 4 (Target: 3+)",
    ]);
    expect(first.pendingDecision).toMatchObject({
      type: "reaction",
      skill: SkillType.DIVING_TACKLE,
    });

    const dived = await game.execute({ type: "use-reaction", accept: true });
    expect(diceOf(dived.events)).toEqual([
      "Armour Roll (Human Lineman #1): 2 + 2 = 4",
    ]);
    expect(game.ctx.team1.players[0].gridPosition).toEqual({ x: 12, y: 5 });
    expect(game.ctx.team1.players[0].status).toBe(PlayerStatus.PRONE);
    expect(game.ctx.team2.players[1].gridPosition).toEqual({ x: 10, y: 5 });
    expect(game.ctx.team2.players[1].status).toBe(PlayerStatus.PRONE);
  });

  it("Tentacles holds the jumper in place with no Jump roll", async () => {
    const game = new HeadlessGame({
      scenario: scenario({
        playerIndex: 1,
        x: 9,
        y: 6,
        skills: [SkillType.TENTACLES],
        stats: { ST: 5 },
      }),
      seed: 1,
    });

    const first = await jump(game);
    expect(first.pendingDecision).toMatchObject({
      type: "reaction",
      skill: SkillType.TENTACLES,
    });

    const held = await game.execute({ type: "use-reaction", accept: true });
    expect(diceOf(held.events)).toEqual(["Tentacles (Human Lineman #2): 4"]);
    expect(game.ctx.team1.players[0].gridPosition).toEqual({ x: 10, y: 5 });
    expect(game.ctx.team1.players[0].status).toBe(PlayerStatus.ACTIVE);
    expect(held.snapshot.activeTeamId).toBe(game.ctx.team1.id);
  });
});

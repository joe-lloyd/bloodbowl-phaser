/**
 * The two-step pass: on the setup turn one receiver goes deep, where the
 * carrier can throw to it next turn and it can then run the ball in.
 */
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import type { PlayerPlacement } from "../../src/types/Scenario";
import { enumerateDecision } from "../../src/simulation/candidates";
import { createPlannerCoach } from "../../src/simulation/ai/planner";
import { createCoachRng } from "../../src/simulation/rng";
import { PassController } from "../../src/game/controllers/PassController";

/** Team 1 scores in column 19. */
const END_ZONE = 19;

const coach = createPlannerCoach();

async function step(subject: HeadlessGame) {
  const point = await enumerateDecision(subject, null);
  const choice = await coach.choose({
    game: subject,
    snapshot: subject.snapshot(),
    point,
    rng: createCoachRng(1),
  });
  const command = point.candidates[choice.index].commands[0];
  const result = await subject.execute(command);
  expect(result.ok, JSON.stringify(command)).toBe(true);
  return { command, note: choice.note };
}

/** Play team 1's turn out with the planner, noting each declaration. */
async function playTurn(subject: HeadlessGame) {
  const declared: string[] = [];
  const commands: { type: string; playerId?: string }[] = [];
  const inPlay = () =>
    subject.snapshot().activeTeamId === "team1" &&
    subject.ctx.gameService.getState().phase === GamePhase.PLAY;
  for (let i = 0; i < 60 && inPlay(); i++) {
    const { command, note } = await step(subject);
    commands.push(command);
    if (command.type === "declare-action")
      declared.push(`${command.playerId}: ${note}`);
  }
  return { declared, commands };
}

/**
 * Turn 3. The carrier, with a thrower's PA, has acted and stands deep in
 * our half, pressed by the defence. A catcher waits behind it.
 */
async function setupTurn(
  carrier: Partial<PlayerPlacement> = {},
  more: PlayerPlacement[] = []
) {
  const subject = new HeadlessGame({
    seed: 1,
    scenario: {
      id: "deep-pass",
      name: "Send a receiver deep",
      description: "",
      setup: {
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        activeTeam: "team1",
        turn: 3,
        teamRerolls: { team1: 0, team2: 0 },
        team1Placements: [
          {
            playerIndex: 0,
            x: 5,
            y: 5,
            hasBall: true,
            stats: { MA: 6, PA: 2 },
            skills: [SkillType.PASS],
            ...carrier,
          },
          {
            playerIndex: 1,
            x: 6,
            y: 2,
            stats: { MA: 8, AG: 2 },
            skills: [SkillType.CATCH],
          },
          ...more,
        ],
        team2Placements: [
          { playerIndex: 0, x: 7, y: 4 },
          { playerIndex: 1, x: 7, y: 6 },
          { playerIndex: 2, x: 8, y: 5 },
        ],
      },
    },
  });
  const [thrower] = subject.ctx.team1.players;
  await subject.execute({
    type: "declare-action",
    playerId: thrower.id,
    action: "move",
  });
  await subject.execute({ type: "end-activation", playerId: thrower.id });
  return subject;
}

/**
 * Turn 4, the throwing turn. Two defenders mark the carrier, so keeping
 * the ball means dodging away; the catcher waits deep and unmarked.
 */
function pressedTurn() {
  return new HeadlessGame({
    seed: 1,
    scenario: {
      id: "pressed-deep-pass",
      name: "Get the ball out of a press",
      description: "",
      setup: {
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        activeTeam: "team1",
        turn: 4,
        teamRerolls: { team1: 1, team2: 1 },
        team1Placements: [
          {
            playerIndex: 0,
            x: 8,
            y: 5,
            hasBall: true,
            stats: { MA: 6, PA: 2 },
            skills: [SkillType.PASS],
          },
          {
            playerIndex: 1,
            x: 13,
            y: 2,
            stats: { MA: 8, AG: 2 },
            skills: [SkillType.CATCH],
          },
        ],
        team2Placements: [
          { playerIndex: 0, x: 9, y: 4 },
          { playerIndex: 1, x: 9, y: 6 },
          { playerIndex: 2, x: 7, y: 5 },
        ],
      },
    },
  });
}

describe("two-step pass", () => {
  it("sends the catcher deep on the setup turn, in range of a pass and a run in", async () => {
    const subject = await setupTurn();
    const [thrower, catcher] = subject.ctx.team1.players;

    const { declared } = await playTurn(subject);

    expect(declared).toEqual([`${catcher.id}: moves to deep`]);
    const at = catcher.gridPosition!;
    expect(END_ZONE - at.x).toBeGreaterThan(0);
    expect(END_ZONE - at.x).toBeLessThanOrEqual(8);
    expect(
      PassController.rangeValue(thrower.gridPosition!, at)
    ).toBeLessThanOrEqual(2);
  });

  it("sends one receiver deep when several could go", async () => {
    const catcher = (playerIndex: number, y: number): PlayerPlacement => ({
      playerIndex,
      x: 6,
      y,
      stats: { MA: 8, AG: 2 },
      skills: [SkillType.CATCH],
    });
    const subject = await setupTurn({}, [catcher(2, 3), catcher(3, 7)]);
    const [, first, second, third] = subject.ctx.team1.players;

    const { declared } = await playTurn(subject);

    expect(declared).toEqual([
      `${first.id}: moves to deep`,
      `${second.id}: blitzes (Dodge: 2+)`,
      `${third.id}: moves to cage`,
    ]);
  });

  it("keeps the catcher home when the carrier can run the ball in next turn", async () => {
    const subject = await setupTurn({ stats: { MA: 8, PA: 2 }, x: 11 });

    const { declared } = await playTurn(subject);

    expect(declared.filter((d) => d.endsWith("moves to deep"))).toEqual([]);
  });

  it("sends nobody deep for a lineman, whose Long Pass rarely lands", async () => {
    const subject = await setupTurn({ stats: { MA: 6, PA: 4 }, skills: [] });

    const { declared } = await playTurn(subject);

    expect(declared.filter((d) => d.endsWith("moves to deep"))).toEqual([]);
  });

  it("throws to the deep catcher next turn, who runs the ball in", async () => {
    const subject = await setupTurn();
    const [thrower, catcher] = subject.ctx.team1.players;
    await playTurn(subject);
    // The defence stays put: their turn ends at once.
    expect(subject.snapshot().activeTeamId).toBe("team2");
    expect((await subject.execute({ type: "end-turn" })).ok).toBe(true);
    const deep = { ...catcher.gridPosition! };

    const { declared, commands } = await playTurn(subject);

    expect(commands).toContainEqual(
      expect.objectContaining({
        type: "pass",
        playerId: thrower.id,
        x: deep.x,
        y: deep.y,
      })
    );
    expect(declared).toEqual([
      `${thrower.id}: throws a pass (Pass: 2+, Catch: 2+)`,
      `${catcher.id}: runs in to score`,
    ]);
    expect(subject.ctx.gameService.getState().score?.team1).toBe(1);
  });

  it("gets the ball out of a press to the deep catcher, who runs it in", async () => {
    const subject = pressedTurn();
    const [thrower, catcher] = subject.ctx.team1.players;

    const { declared } = await playTurn(subject);

    expect(declared).toEqual([
      `${thrower.id}: hands off (Dodge: 4+, Dodge: 3+, Rush: 2+, Catch: 2+)`,
      `${catcher.id}: runs in to score`,
    ]);
    expect(subject.ctx.gameService.getState().score?.team1).toBe(1);
  });
});

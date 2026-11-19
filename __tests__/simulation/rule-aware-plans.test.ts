import { describe, expect, it } from "vitest";
import { fieldPlayer, game, step } from "./fixtures";
import { createPlannerCoach } from "../../src/simulation/ai/planner";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { DEFAULT_WEIGHTS } from "../../src/simulation/ai/weights";
import type { HeadlessGame } from "../../src/headless/HeadlessGame";
import type { HeadlessCommand } from "../../src/headless/protocol";

async function firstActivation(subject: HeadlessGame) {
  const coach = createPlannerCoach();
  const commands: HeadlessCommand["type"][] = [];
  const notes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const { command, note } = await step(subject, coach);
    commands.push(command.type);
    if (note) notes.push(note);
    if (command.type === "end-activation" || command.type === "block") break;
  }
  return { commands, note: notes[0] };
}

describe("a prone player beside the carrier, three squares from scoring", () => {
  const subject = () =>
    game({
      turn: 3,
      team1Placements: [
        { playerIndex: 0, x: 4, y: 5, status: PlayerStatus.PRONE },
      ],
      team2Placements: [{ playerIndex: 0, x: 3, y: 5, hasBall: true }],
    });

  it("stands up and blocks the carrier", async () => {
    expect(await firstActivation(subject())).toEqual({
      commands: ["declare-action", "stand-up", "block"],
      note: "blitzes",
    });
  });
});

describe("a No Ball player beside a loose ball, a team-mate three squares away", () => {
  const subject = () =>
    game({
      turn: 3,
      ballPosition: { x: 6, y: 5 },
      team1Placements: [
        { playerIndex: 0, x: 5, y: 5, skills: [SkillType.NO_BALL] },
        { playerIndex: 1, x: 3, y: 5 },
      ],
      team2Placements: [{ playerIndex: 0, x: 15, y: 1 }],
    });

  it("leaves the pick-up to a team-mate", async () => {
    const s = subject();
    const picker = fieldPlayer(s.ctx.team1.players[1]);
    const { command, note } = await step(s, createPlannerCoach());
    expect({ command, note }).toEqual({
      command: {
        type: "declare-action",
        playerId: picker.id,
        action: "secureBall",
      },
      note: "secures the ball (Secure the Ball: 2+)",
    });
  });
});

describe("a team-mate eight squares behind our carrier, with 82% moves allowed", () => {
  async function chaseNotes() {
    const subject = game({
      turn: 3,
      team1Placements: [
        { playerIndex: 0, x: 10, y: 5, hasBall: true },
        { playerIndex: 1, x: 2, y: 5, stats: { MA: 5 } },
      ],
      team2Placements: [
        { playerIndex: 0, x: 17, y: 1 },
        { playerIndex: 1, x: 17, y: 9 },
      ],
    });
    const chaser = fieldPlayer(subject.ctx.team1.players[1]);
    const coach = createPlannerCoach({
      weights: { ...DEFAULT_WEIGHTS, safeMove: 0.82 },
    });
    const notes: string[] = [];
    for (
      let i = 0;
      i < 30 && subject.ctx.gameService.getState().turn.teamId === "team1";
      i++
    ) {
      const { command, note } = await step(subject, coach);
      if (
        command.type === "declare-action" &&
        command.playerId === chaser.id &&
        note
      )
        notes.push(note);
    }
    return notes;
  }

  it("does not risk a turnover to close in", async () => {
    expect(await chaseNotes()).toEqual(["moves to chase"]);
  });
});

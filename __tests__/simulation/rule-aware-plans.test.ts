import { describe, expect, it } from "vitest";
import { game, step } from "./fixtures";
import { createPlannerCoach } from "../../src/simulation/ai/planner";
import { PlayerStatus } from "../../src/types/Player";
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

describe("a prone player's Blitz", () => {
  // Our only player lies prone beside their ball carrier, who is three
  // squares from scoring.
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

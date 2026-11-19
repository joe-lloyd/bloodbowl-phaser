import { expect } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { onField, type FieldPlayer } from "../../src/simulation/ai/board";
import type { Player } from "../../src/types/Player";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import type { ScenarioSetup } from "../../src/types/Scenario";
import { enumerateDecision } from "../../src/simulation/candidates";
import { createCoachRng } from "../../src/simulation/rng";
import type { Coach } from "../../src/simulation/coach";

export function fieldPlayer(value: Player | undefined): FieldPlayer {
  const player = fixtureValue(value);
  if (!onField(player)) throw new Error("Expected a player on the pitch");
  return player;
}

export function game(
  setup: Pick<ScenarioSetup, "team1Placements"> & Partial<ScenarioSetup>
) {
  return new HeadlessGame({
    seed: 1,
    scenario: {
      id: "turn-plan",
      name: "Complete a tactical plan",
      description: "",
      setup: {
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        activeTeam: "team1",
        turn: 6,
        teamRerolls: { team1: 0, team2: 0 },
        team2Placements: [{ playerIndex: 0, x: 1, y: 1 }],
        ...setup,
      },
    },
  });
}

export async function step(subject: HeadlessGame, coach: Coach, seed = 1) {
  const point = await enumerateDecision(subject, null);
  const choice = await coach.choose({
    game: subject,
    snapshot: subject.snapshot(),
    point,
    rng: createCoachRng(seed),
  });
  const command = fixtureValue(point.candidates[choice.index]).commands[0];
  const result = await subject.execute(command);
  expect(result.ok, JSON.stringify(command)).toBe(true);
  return { command, note: choice.note };
}

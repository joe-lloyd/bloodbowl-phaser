import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import { checkInvariants } from "../../../src/simulation/invariants";
import type { GameSnapshot } from "../../../src/headless/serialization";

/** A snapshot with `count` of team one's players on the pitch. */
function fielding(count: number, swarmingRoll?: number): GameSnapshot {
  const snapshot = structuredClone(new HeadlessGame({ seed: 1 }).snapshot());
  const team = snapshot.teams[0];
  // A Sevens team carries up to 11, but the default fixture has 7
  while (team.players.length < count) {
    team.players.push({
      ...team.players[0],
      id: `${team.id}-extra-${team.players.length}`,
    });
  }
  team.players.forEach((player, index) => {
    player.position = index < count ? { x: 1, y: index } : undefined;
  });
  snapshot.teams[1].players.forEach((player) => {
    player.position = undefined;
  });
  if (swarmingRoll !== undefined) {
    snapshot.setup = {
      ...(snapshot.setup ?? {
        kickingTeamId: null,
        receivingTeamId: null,
        currentTeamId: null,
        confirmedTeamIds: [],
        teams: {},
      }),
      swarming: {
        pendingTeamIds: [],
        teams: { [team.id]: { roll: swarmingRoll, basePlayerIds: [] } },
      },
    };
  }
  return snapshot;
}

const sevenASide = (after: GameSnapshot) =>
  checkInvariants(after, after, false).filter((v) => v.rule === "seven-a-side");

describe("the seven-a-side invariant", () => {
  it("flags an eighth player without Swarming", () => {
    expect(sevenASide(fielding(8)).length).toBe(1);
  });

  it("allows the Linemen a Swarming roll adds, and no more", () => {
    expect(sevenASide(fielding(8, 1))).toEqual([]);
    expect(sevenASide(fielding(9, 1)).length).toBe(1);
  });
});

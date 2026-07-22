import { describe, it, expect } from "vitest";
import { computeActionAvailability } from "../../../src/game/rules/actionAvailability";
import { Player, PlayerStatus } from "../../../src/types/Player";
import { SkillType, getSkill } from "../../../src/types/Skills";

const P = (over: Partial<Player>): Player =>
  ({
    id: "p",
    teamId: "team1",
    playerName: "P",
    status: PlayerStatus.ACTIVE,
    hasActed: false,
    skills: [],
    stats: { MA: 6, ST: 3, AG: 3, PA: 3, AV: 8 },
    ...over,
  }) as Player;

const noTurn = {
  hasBlitzed: false,
  hasPassed: false,
  hasHandedOff: false,
  hasFouled: false,
};

const base = () => ({
  player: P({ gridPosition: { x: 5, y: 5 } }),
  ballPosition: null as { x: number; y: number } | null,
  opponents: [] as Player[],
  teammates: [] as Player[],
  reachable: [] as { x: number; y: number; cost?: number }[],
  turn: { ...noTurn },
  hasMovedInAction: false,
});

describe("computeActionAvailability", () => {
  it("hides Foul when no downed enemy is reachable", () => {
    const input = base();
    input.opponents = [
      P({ id: "e", teamId: "team2", gridPosition: { x: 18, y: 9 }, status: PlayerStatus.PRONE }),
    ];
    expect(computeActionAvailability(input).foul).toBe(false);
  });

  it("shows Foul when a downed enemy is adjacent (or reachable-adjacent)", () => {
    const input = base();
    input.opponents = [
      P({ id: "e", teamId: "team2", gridPosition: { x: 6, y: 5 }, status: PlayerStatus.STUNNED }),
    ];
    expect(computeActionAvailability(input).foul).toBe(true);
  });

  it("hides Pass/Hand-off when the player neither holds nor can reach the ball", () => {
    const input = base();
    input.ballPosition = { x: 1, y: 1 }; // far, not in reachable
    const a = computeActionAvailability(input);
    expect(a.pass).toBe(false);
    expect(a.handoff).toBe(false);
  });

  it("shows Pass when holding the ball, but Hand-off only with a reachable team-mate", () => {
    const input = base();
    input.ballPosition = { x: 5, y: 5 }; // on the player
    // no team-mates yet
    expect(computeActionAvailability(input).pass).toBe(true);
    expect(computeActionAvailability(input).handoff).toBe(false);

    input.teammates = [
      P({ id: "m", gridPosition: { x: 6, y: 5 }, status: PlayerStatus.ACTIVE }),
    ];
    expect(computeActionAvailability(input).handoff).toBe(true);
  });

  it("offers Pass when the ball is on the floor within reach (move to pick up)", () => {
    const input = base();
    input.ballPosition = { x: 7, y: 5 };
    input.reachable = [{ x: 7, y: 5, cost: 2 }];
    expect(computeActionAvailability(input).pass).toBe(true);
    expect(computeActionAvailability(input).secureBall).toBe(true);
  });

  it("gates Blitz on a standing enemy the player can end adjacent to", () => {
    const input = base();
    input.opponents = [
      P({ id: "e", teamId: "team2", gridPosition: { x: 9, y: 5 }, status: PlayerStatus.ACTIVE }),
    ];
    expect(computeActionAvailability(input).blitz).toBe(false);
    input.reachable = [{ x: 8, y: 5, cost: 3 }]; // adjacent to the enemy
    expect(computeActionAvailability(input).blitz).toBe(true);
  });

  it("offers a special action only with the skill AND an adjacent standing enemy", () => {
    const input = base();
    input.player = P({
      gridPosition: { x: 5, y: 5 },
      skills: [getSkill(SkillType.HYPNOTIC_GAZE)],
    });
    // no enemy adjacent yet
    expect(computeActionAvailability(input).gaze).toBe(false);
    input.opponents = [
      P({ id: "e", teamId: "team2", gridPosition: { x: 6, y: 5 }, status: PlayerStatus.ACTIVE }),
    ];
    expect(computeActionAvailability(input).gaze).toBe(true);
    // a player without the skill never sees it
    input.player = P({ gridPosition: { x: 5, y: 5 } });
    expect(computeActionAvailability(input).gaze).toBe(false);
  });

  it("shows nothing actionable once the player has acted", () => {
    const input = base();
    input.player = P({ gridPosition: { x: 5, y: 5 }, hasActed: true });
    input.ballPosition = { x: 5, y: 5 };
    const a = computeActionAvailability(input);
    expect(a.pass).toBe(false);
    expect(a.move).toBe(false);
  });

  it("marks Stand Up for a prone player", () => {
    const input = base();
    input.player = P({ gridPosition: { x: 5, y: 5 }, status: PlayerStatus.PRONE });
    expect(computeActionAvailability(input).standUp).toBe(true);
  });

  it("offers Throw Team-mate only with the trait AND an adjacent Right-Stuff mate (ST<=3)", () => {
    const input = base();
    input.player = P({
      gridPosition: { x: 5, y: 5 },
      skills: [getSkill(SkillType.THROW_TEAM_MATE)],
    });
    // A Right-Stuff, ST 2 team-mate standing adjacent — eligible target.
    input.teammates = [
      P({
        id: "m",
        gridPosition: { x: 6, y: 5 },
        status: PlayerStatus.ACTIVE,
        skills: [getSkill(SkillType.RIGHT_STUFF)],
        stats: { MA: 6, ST: 2, AG: 3, PA: 3, AV: 7 },
      }),
    ];
    expect(computeActionAvailability(input).throwTeammate).toBe(true);

    // Same mate but Strength 4 — no longer a legal target.
    input.teammates[0].stats.ST = 4;
    expect(computeActionAvailability(input).throwTeammate).toBe(false);

    // Reset to ST 2 but strip Right Stuff — still not a target.
    input.teammates[0].stats.ST = 2;
    input.teammates[0].skills = [];
    expect(computeActionAvailability(input).throwTeammate).toBe(false);
  });

  it("does not offer Throw Team-mate to a player without the trait", () => {
    const input = base();
    input.teammates = [
      P({
        id: "m",
        gridPosition: { x: 6, y: 5 },
        status: PlayerStatus.ACTIVE,
        skills: [getSkill(SkillType.RIGHT_STUFF)],
        stats: { MA: 6, ST: 2, AG: 3, PA: 3, AV: 7 },
      }),
    ];
    expect(computeActionAvailability(input).throwTeammate).toBe(false);
  });

  it("offers Kick Team-mate to a Kick-Team-mate player with an eligible adjacent mate", () => {
    const input = base();
    input.player = P({
      gridPosition: { x: 5, y: 5 },
      skills: [getSkill(SkillType.KICK_TEAM_MATE)],
    });
    input.teammates = [
      P({
        id: "m",
        gridPosition: { x: 6, y: 5 },
        status: PlayerStatus.ACTIVE,
        skills: [getSkill(SkillType.RIGHT_STUFF)],
        stats: { MA: 6, ST: 2, AG: 3, PA: 3, AV: 7 },
      }),
    ];
    expect(computeActionAvailability(input).kickTeammate).toBe(true);
    expect(computeActionAvailability(input).throwTeammate).toBe(false);
  });
});

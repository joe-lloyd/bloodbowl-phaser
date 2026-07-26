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
  it("offers Block when adjacent to a Standing opponent and not yet moved", () => {
    const input = base();
    input.opponents = [
      P({ id: "e", teamId: "team2", gridPosition: { x: 6, y: 5 } }),
    ];
    expect(computeActionAvailability(input).block).toBe(true);
    // Once the player has moved, a Block needs a Blitz instead.
    input.hasMovedInAction = true;
    expect(computeActionAvailability(input).block).toBe(false);
  });

  it("hides Block when the adjacent opponent is down", () => {
    const input = base();
    input.opponents = [
      P({
        id: "e",
        teamId: "team2",
        gridPosition: { x: 6, y: 5 },
        status: PlayerStatus.PRONE,
      }),
    ];
    expect(computeActionAvailability(input).block).toBe(false);
  });

  it("offers Jump over an adjacent Prone player with an empty landing square", () => {
    const input = base();
    // Prone player directly to the right; (7,5) is the empty landing square.
    input.opponents = [
      P({
        id: "e",
        teamId: "team2",
        gridPosition: { x: 6, y: 5 },
        status: PlayerStatus.PRONE,
      }),
    ];
    expect(computeActionAvailability(input).jump).toBe(true);
  });

  it("hides Jump when the only adjacent player is Standing (needs Leap/Pogo)", () => {
    const input = base();
    input.opponents = [
      P({ id: "e", teamId: "team2", gridPosition: { x: 6, y: 5 } }), // Standing
    ];
    expect(computeActionAvailability(input).jump).toBe(false);
  });

  it("offers Jump over a Standing player when the jumper has Leap", () => {
    const input = base();
    input.player = P({
      gridPosition: { x: 5, y: 5 },
      skills: [getSkill(SkillType.LEAP)],
    });
    input.opponents = [
      P({ id: "e", teamId: "team2", gridPosition: { x: 6, y: 5 } }), // Standing
    ];
    expect(computeActionAvailability(input).jump).toBe(true);
  });

  it("hides Jump when all three push-back squares beyond the downed player are occupied", () => {
    const input = base();
    input.opponents = [
      P({
        id: "e",
        teamId: "team2",
        gridPosition: { x: 6, y: 5 },
        status: PlayerStatus.PRONE,
      }),
      // Push-back squares of (6,5) from (5,5) are (7,5)/(7,4)/(7,6) — fill them.
      P({ id: "e2", teamId: "team2", gridPosition: { x: 7, y: 5 } }),
      P({ id: "e3", teamId: "team2", gridPosition: { x: 7, y: 4 } }),
      P({ id: "e4", teamId: "team2", gridPosition: { x: 7, y: 6 } }),
    ];
    expect(computeActionAvailability(input).jump).toBe(false);
  });

  it("offers Jump over a diagonally-adjacent downed player (push-back squares)", () => {
    const input = base();
    // Prone player at (6,6) diagonal to the jumper at (5,5): push-back squares
    // (7,7)/(7,6)/(6,7) are empty, so a Jump is offered.
    input.opponents = [
      P({
        id: "e",
        teamId: "team2",
        gridPosition: { x: 6, y: 6 },
        status: PlayerStatus.PRONE,
      }),
    ];
    expect(computeActionAvailability(input).jump).toBe(true);
  });

  it("hides Foul when no downed enemy is reachable", () => {
    const input = base();
    input.opponents = [
      P({
        id: "e",
        teamId: "team2",
        gridPosition: { x: 18, y: 9 },
        status: PlayerStatus.PRONE,
      }),
    ];
    expect(computeActionAvailability(input).foul).toBe(false);
  });

  it("shows Foul when a downed enemy is adjacent (or reachable-adjacent)", () => {
    const input = base();
    input.opponents = [
      P({
        id: "e",
        teamId: "team2",
        gridPosition: { x: 6, y: 5 },
        status: PlayerStatus.STUNNED,
      }),
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
      P({
        id: "e",
        teamId: "team2",
        gridPosition: { x: 9, y: 5 },
        status: PlayerStatus.ACTIVE,
      }),
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
      P({
        id: "e",
        teamId: "team2",
        gridPosition: { x: 6, y: 5 },
        status: PlayerStatus.ACTIVE,
      }),
    ];
    expect(computeActionAvailability(input).gaze).toBe(true);
    // a player without the skill never sees it
    input.player = P({ gridPosition: { x: 5, y: 5 } });
    expect(computeActionAvailability(input).gaze).toBe(false);
  });

  it("offers typed direct and labelled Blitz replacements for every eligible attack", () => {
    const input = base();
    input.player = P({
      gridPosition: { x: 5, y: 5 },
      skills: [
        getSkill(SkillType.STAB),
        getSkill(SkillType.CHAINSAW),
        getSkill(SkillType.BREATHE_FIRE),
        getSkill(SkillType.MONSTROUS_MOUTH),
        getSkill(SkillType.PROJECTILE_VOMIT),
      ],
    });
    input.opponents = [
      P({
        id: "e",
        teamId: "team2",
        gridPosition: { x: 6, y: 5 },
      }),
    ];

    const availability = computeActionAvailability(input);
    expect(availability.directBlockReplacements).toEqual([
      "stab",
      "chainsaw",
      "breatheFire",
      "chomp",
      "vomit",
    ]);
    expect(availability.blitzBlockReplacements).toEqual([
      "stab",
      "chainsaw",
      "breatheFire",
      "chomp",
      "vomit",
    ]);

    input.turn.hasBlitzed = true;
    expect(computeActionAvailability(input).blitzBlockReplacements).toEqual([]);
  });

  it("offers only a Blitz replacement when movement can reach the target", () => {
    const input = base();
    input.player = P({
      gridPosition: { x: 5, y: 5 },
      skills: [getSkill(SkillType.STAB)],
    });
    input.opponents = [
      P({
        id: "e",
        teamId: "team2",
        gridPosition: { x: 9, y: 5 },
      }),
    ];
    input.reachable = [{ x: 8, y: 5 }];

    const availability = computeActionAvailability(input);
    expect(availability.directBlockReplacements).toEqual([]);
    expect(availability.blitzBlockReplacements).toEqual(["stab"]);
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
    input.player = P({
      gridPosition: { x: 5, y: 5 },
      status: PlayerStatus.PRONE,
    });
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

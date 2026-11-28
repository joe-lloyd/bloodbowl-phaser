import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type HeadlessCommand } from "../../src/headless/protocol";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { type PlayerPlacement } from "../../src/types/Scenario";
import { SkillType } from "../../src/types/Skills";
import { enumerateDecision } from "../../src/simulation/candidates";
import { plannerCoach } from "../../src/simulation/ai/planner";
import { createCoachRng } from "../../src/simulation/rng";
import { fixtureValue } from "../../src/testing/fixtureValue";

const S = SkillType;
const ATTACKER = "team1-player-1";
const TARGET = "team2-player-1";
const FAR_CARRIER: PlayerPlacement = {
  playerIndex: 1,
  x: 1,
  y: 1,
  hasBall: true,
};

function game(
  ours: PlayerPlacement[],
  theirs: PlayerPlacement[]
): HeadlessGame {
  return new HeadlessGame({
    seed: 1,
    scenario: {
      id: "block-replacements",
      name: "Block replacement choices",
      description: "",
      setup: {
        team1Placements: ours,
        team2Placements: theirs,
        activeTeam: "team1",
        turn: 3,
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        teamRerolls: { team1: 0, team2: 0 },
      },
    },
  });
}

async function choose(subject: HeadlessGame): Promise<HeadlessCommand> {
  const point = await enumerateDecision(subject, null);
  const choice = await plannerCoach.choose({
    game: subject,
    snapshot: subject.snapshot(),
    point,
    rng: createCoachRng(1),
  });
  const command = fixtureValue(point.candidates[choice.index]).commands[0];
  const response = await subject.execute(command);
  expect(response.ok, JSON.stringify(command)).toBe(true);
  return command;
}

async function hitWith(subject: HeadlessGame): Promise<HeadlessCommand> {
  const declared = await choose(subject);
  expect(declared).toMatchObject({
    type: "declare-action",
    playerId: ATTACKER,
  });
  return choose(subject);
}

const special = (action: string) => ({
  type: "special-action",
  action,
  attackerId: ATTACKER,
  defenderId: TARGET,
});

const block = { type: "block", attackerId: ATTACKER, defenderId: TARGET };

const troll: PlayerPlacement = {
  playerIndex: 0,
  x: 10,
  y: 5,
  stats: { ST: 5, AV: 10 },
  skills: [S.PROJECTILE_VOMIT, S.MIGHTY_BLOW],
};

describe("block replacements", () => {
  it("vomits on a Wardancer with Dodge and Block", async () => {
    const subject = game(
      [troll],
      [
        {
          playerIndex: 0,
          x: 11,
          y: 5,
          stats: { ST: 3, AV: 8 },
          skills: [S.DODGE, S.BLOCK],
        },
        FAR_CARRIER,
      ]
    );
    expect(await choose(subject)).toEqual({
      type: "declare-action",
      playerId: ATTACKER,
      action: "vomit",
    });
    expect(await choose(subject)).toEqual(special("vomit"));
  });

  it("blocks an ST 2 lineman with no skills instead of vomiting", async () => {
    const subject = game(
      [troll],
      [{ playerIndex: 0, x: 11, y: 5, stats: { ST: 2 } }, FAR_CARRIER]
    );
    expect(await hitWith(subject)).toEqual(block);
  });

  it("blitzes with Projectile Vomit when the Wardancer is two squares away", async () => {
    const subject = game(
      [troll],
      [
        {
          playerIndex: 0,
          x: 12,
          y: 5,
          stats: { ST: 3, AV: 8 },
          skills: [S.DODGE, S.BLOCK],
        },
        FAR_CARRIER,
      ]
    );
    expect(await choose(subject)).toEqual({
      type: "declare-action",
      playerId: ATTACKER,
      action: "blitz",
      blockReplacement: "vomit",
    });
    expect(await choose(subject)).toMatchObject({
      type: "move",
      playerId: ATTACKER,
    });
    expect(await choose(subject)).toEqual(special("vomit"));
  });

  it("stabs an armoured player a weak attacker cannot block", async () => {
    const subject = game(
      [
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          stats: { ST: 2 },
          skills: [S.STAB, S.DODGE],
        },
      ],
      [
        {
          playerIndex: 0,
          x: 11,
          y: 5,
          stats: { ST: 4, AV: 8 },
          skills: [S.BLOCK],
        },
        FAR_CARRIER,
      ]
    );
    expect(await hitWith(subject)).toEqual({
      type: "stab",
      attackerId: ATTACKER,
      defenderId: TARGET,
    });
  });

  it("blocks with a strong stabber when the block is a sure knockdown", async () => {
    const subject = game(
      [
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          stats: { ST: 5 },
          skills: [S.STAB, S.BLOCK],
        },
      ],
      [{ playerIndex: 0, x: 11, y: 5, stats: { ST: 2, AV: 10 } }, FAR_CARRIER]
    );
    expect(await hitWith(subject)).toEqual(block);
  });

  it("chainsaws a strong blocker", async () => {
    const subject = game(
      [{ playerIndex: 0, x: 10, y: 5, stats: { ST: 3 }, skills: [S.CHAINSAW] }],
      [
        {
          playerIndex: 0,
          x: 11,
          y: 5,
          stats: { ST: 4, AV: 9 },
          skills: [S.BLOCK],
        },
        FAR_CARRIER,
      ]
    );
    expect(await hitWith(subject)).toEqual(special("chainsaw"));
  });

  it("blocks a weak player rather than risk the chainsaw kick-back", async () => {
    const subject = game(
      [
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          stats: { ST: 6 },
          skills: [S.CHAINSAW, S.BLOCK],
        },
      ],
      [{ playerIndex: 0, x: 11, y: 5, stats: { ST: 1, AV: 10 } }, FAR_CARRIER]
    );
    expect(await hitWith(subject)).toEqual(block);
  });

  it("breathes fire on a stronger blocker", async () => {
    const subject = game(
      [
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          stats: { ST: 3 },
          skills: [S.BREATHE_FIRE],
        },
      ],
      [
        { playerIndex: 0, x: 11, y: 5, stats: { ST: 4 }, skills: [S.BLOCK] },
        FAR_CARRIER,
      ]
    );
    expect(await hitWith(subject)).toEqual(special("breatheFire"));
  });

  it("blocks a weak player rather than breathe fire", async () => {
    const subject = game(
      [
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          stats: { ST: 4 },
          skills: [S.BREATHE_FIRE, S.BLOCK],
        },
      ],
      [{ playerIndex: 0, x: 11, y: 5, stats: { ST: 1 } }, FAR_CARRIER]
    );
    expect(await hitWith(subject)).toEqual(block);
  });

  it("chomps a strong ball carrier to pin him", async () => {
    const subject = game(
      [
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          stats: { ST: 3 },
          skills: [S.MONSTROUS_MOUTH],
        },
      ],
      [
        {
          playerIndex: 0,
          x: 11,
          y: 5,
          stats: { ST: 4 },
          skills: [S.BLOCK],
          hasBall: true,
        },
      ]
    );
    expect(await hitWith(subject)).toEqual(special("chomp"));
  });

  it("does not chomp a player without the ball", async () => {
    const subject = game(
      [
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          stats: { ST: 4 },
          skills: [S.MONSTROUS_MOUTH],
        },
      ],
      [{ playerIndex: 0, x: 11, y: 5, stats: { ST: 2 } }, FAR_CARRIER]
    );
    expect(await hitWith(subject)).toEqual(block);
  });
});

function gazeBoard(teammateAG: number): HeadlessGame {
  return game(
    [
      {
        playerIndex: 0,
        x: 11,
        y: 3,
        stats: { ST: 4, MA: 1 },
        skills: [S.HYPNOTIC_GAZE],
      },
      { playerIndex: 1, x: 12, y: 5, stats: { ST: 3, AG: teammateAG } },
    ],
    [
      { playerIndex: 0, x: 12, y: 4, stats: { ST: 3 } },
      { playerIndex: 1, x: 15, y: 5, stats: { ST: 3 }, hasBall: true },
      { playerIndex: 2, x: 10, y: 3, stats: { ST: 1, AV: 8 } },
    ]
  );
}

describe("Hypnotic Gaze against the gazer's own block", () => {
  it("gazes the marker so a teammate who cannot dodge can blitz the carrier", async () => {
    const subject = gazeBoard(6);
    expect(await choose(subject)).toEqual({
      type: "declare-action",
      playerId: ATTACKER,
      action: "gaze",
    });
    expect(await choose(subject)).toEqual(special("gaze"));
    expect(await choose(subject)).toMatchObject({
      type: "declare-action",
      playerId: "team1-player-2",
      action: "blitz",
    });
  });

  it("lets a teammate who dodges on 2+ blitz without the gaze", async () => {
    const subject = gazeBoard(2);
    expect(await choose(subject)).toMatchObject({
      type: "declare-action",
      playerId: "team1-player-2",
      action: "blitz",
    });
  });
});

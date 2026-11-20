import { describe, expect, it } from "vitest";
import { fieldPlayer, game, step } from "./fixtures";
import { createPlannerCoach } from "../../src/simulation/ai/planner";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { DEFAULT_WEIGHTS } from "../../src/simulation/ai/weights";
import { enumerateDecision } from "../../src/simulation/candidates";
import { activations } from "../../src/simulation/ai/activations";
import { readBoard } from "../../src/simulation/ai/board";
import { availableActions } from "../../src/simulation/ai/planner";
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

describe("an Unchannelled Fury player beside a loose ball, a team-mate two squares away", () => {
  it("leaves the ball to the team-mate", async () => {
    const subject = game({
      turn: 3,
      ballPosition: { x: 6, y: 5 },
      team1Placements: [
        { playerIndex: 0, x: 5, y: 5, skills: [SkillType.UNCHANNELLED_FURY] },
        { playerIndex: 1, x: 4, y: 5 },
      ],
      team2Placements: [{ playerIndex: 0, x: 15, y: 1 }],
    });
    const mate = fieldPlayer(subject.ctx.team1.players[1]);
    const { command } = await step(subject, createPlannerCoach());
    expect(command).toEqual({
      type: "declare-action",
      playerId: mate.id,
      action: "secureBall",
    });
  });
});

describe("a Really Stupid player beside an opponent, a slow free team-mate three squares away", () => {
  it("moves the team-mate beside it before it blocks", async () => {
    const subject = game({
      turn: 3,
      team1Placements: [
        {
          playerIndex: 0,
          x: 8,
          y: 5,
          skills: [SkillType.REALLY_STUPID],
          stats: { ST: 5 },
        },
        { playerIndex: 1, x: 5, y: 5, stats: { MA: 2 } },
      ],
      team2Placements: [
        { playerIndex: 0, x: 9, y: 5 },
        { playerIndex: 1, x: 18, y: 1, hasBall: true },
      ],
    });
    const coach = createPlannerCoach();
    const first = await step(subject, coach);
    const notes = [first.note];
    for (let i = 0; i < 8; i++) {
      const next = await step(subject, coach);
      if (next.command.type === "declare-action") {
        notes.push(next.note);
        break;
      }
    }
    expect(notes).toEqual(["moves to steady", "blocks"]);
  });
});

describe("our ST4 carrier with Block, marked by one ST3 opponent in front", () => {
  it("blitzes the marker", async () => {
    const subject = game({
      turn: 3,
      team1Placements: [
        {
          playerIndex: 0,
          x: 8,
          y: 5,
          hasBall: true,
          stats: { ST: 4, AG: 5 },
          skills: [SkillType.BLOCK],
        },
      ],
      team2Placements: [
        { playerIndex: 0, x: 9, y: 5 },
        { playerIndex: 1, x: 17, y: 2 },
      ],
    });
    expect(await firstActivation(subject)).toEqual({
      commands: ["declare-action", "block"],
      note: "blitzes",
    });
  });
});

describe("a carrier marked by three opponents, one of which team-mates can hit safely", () => {
  it("hits the marker before the carrier dodges", async () => {
    const lineman = {
      stats: { MA: 4, ST: 3, AG: 4 },
      skills: [SkillType.BLOCK, SkillType.THICK_SKULL],
    };
    const subject = game({
      turn: 3,
      team1Placements: [
        { playerIndex: 0, x: 9, y: 7, hasBall: true, stats: { MA: 6 } },
        { playerIndex: 1, x: 8, y: 7, ...lineman },
        { playerIndex: 2, x: 8, y: 5, ...lineman },
        { playerIndex: 3, x: 9, y: 5, ...lineman },
      ],
      team2Placements: [
        { playerIndex: 0, x: 9, y: 6 },
        { playerIndex: 1, x: 10, y: 6 },
        { playerIndex: 2, x: 10, y: 7 },
        { playerIndex: 3, x: 11, y: 5 },
      ],
    });
    expect(await firstActivation(subject)).toEqual({
      commands: ["declare-action", "block"],
      note: "blocks",
    });
  });
});

describe("a Take Root player's Blitz", () => {
  async function blitzValue(
    target: { x: number; y: number },
    skills: SkillType[]
  ) {
    const subject = game({
      turn: 3,
      team1Placements: [
        { playerIndex: 0, x: 8, y: 5, stats: { ST: 5 }, skills },
      ],
      team2Placements: [
        { playerIndex: 0, ...target },
        { playerIndex: 1, x: 18, y: 1, hasBall: true },
      ],
    });
    const point = await enumerateDecision(subject, null);
    const blitz = activations({
      board: readBoard(subject, "team1"),
      w: DEFAULT_WEIGHTS,
      available: availableActions(point.candidates),
    }).find((a) => a.action === "blitz");
    return blitz?.value ?? NaN;
  }

  it("keeps full value against an opponent it already stands beside", async () => {
    const beside = { x: 9, y: 5 };
    expect(await blitzValue(beside, [SkillType.TAKE_ROOT])).toBeCloseTo(
      await blitzValue(beside, []),
      9
    );
  });

  it("loses a sixth when it must move to reach the opponent", async () => {
    const away = { x: 11, y: 5 };
    expect(await blitzValue(away, [SkillType.TAKE_ROOT])).toBeCloseTo(
      ((await blitzValue(away, [])) * 5) / 6,
      9
    );
  });
});

describe("a helper who can steady a Really Stupid team-mate", () => {
  async function plans(helperSkills: SkillType[]) {
    const subject = game({
      turn: 3,
      team1Placements: [
        {
          playerIndex: 0,
          x: 8,
          y: 5,
          stats: { ST: 5 },
          skills: [SkillType.REALLY_STUPID],
        },
        { playerIndex: 1, x: 5, y: 5, stats: { MA: 2 }, skills: helperSkills },
      ],
      team2Placements: [
        { playerIndex: 0, x: 9, y: 5 },
        { playerIndex: 1, x: 18, y: 1, hasBall: true },
      ],
    });
    const point = await enumerateDecision(subject, null);
    const all = activations({
      board: readBoard(subject, "team1"),
      w: DEFAULT_WEIGHTS,
      available: availableActions(point.candidates),
    });
    const big = fieldPlayer(subject.ctx.team1.players[0]);
    const steady =
      all.find(
        (a) => a.intent.kind === "reposition" && a.intent.role === "steady"
      )?.value ?? NaN;
    const waiting = Math.max(
      ...all.filter((a) => a.player.id === big.id).map((a) => a.value)
    );
    return { steady, waiting };
  }

  it("prices the move by the helper's own Take Root roll", async () => {
    expect((await plans([SkillType.TAKE_ROOT])).steady).toBeCloseTo(
      ((await plans([])).steady * 5) / 6,
      9
    );
  });

  it("makes the Big Guy wait only for the help the move is worth", async () => {
    const rooted = await plans([SkillType.TAKE_ROOT]);
    const plain = await plans([]);
    expect(rooted.waiting + rooted.steady).toBeCloseTo(
      plain.waiting + plain.steady,
      9
    );
  });
});

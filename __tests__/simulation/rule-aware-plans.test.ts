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

describe("an ST4 player beside an ST3 opponent whose push lands between two of its team-mates", () => {
  async function firstChoice(skills: SkillType[]) {
    const subject = game({
      turn: 3,
      team1Placements: [
        { playerIndex: 0, x: 8, y: 5, stats: { ST: 4 }, skills },
        { playerIndex: 1, x: 1, y: 1 },
        { playerIndex: 2, x: 1, y: 3 },
        { playerIndex: 3, x: 1, y: 7 },
        { playerIndex: 4, x: 1, y: 9 },
        { playerIndex: 5, x: 2, y: 5 },
      ],
      team2Placements: [
        { playerIndex: 0, x: 9, y: 5 },
        { playerIndex: 1, x: 10, y: 4 },
        { playerIndex: 2, x: 10, y: 6 },
        { playerIndex: 3, x: 18, y: 1, hasBall: true },
      ],
    });
    const hitter = fieldPlayer(subject.ctx.team1.players[0]);
    const { command, note } = await step(subject, createPlannerCoach());
    return {
      hitter: "playerId" in command && command.playerId === hitter.id,
      note,
    };
  }

  it("blocks without Frenzy", async () => {
    expect(await firstChoice([])).toEqual({ hitter: true, note: "blocks" });
  });

  it("holds back with Frenzy, whose second block would be uphill", async () => {
    expect(await firstChoice([SkillType.FRENZY])).toEqual({
      hitter: false,
      note: "moves to chase",
    });
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

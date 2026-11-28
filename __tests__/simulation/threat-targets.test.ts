import { describe, expect, it } from "vitest";
import { game, step } from "./fixtures";
import { createPlannerCoach } from "../../src/simulation/ai/planner";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { RosterName } from "../../src/types/Team";
import type { HeadlessGame } from "../../src/headless/HeadlessGame";
import type { PlayerPlacement } from "../../src/types/Scenario";

const WAGON = 0;
const TROLL = 1;
const RUNNA = 2;
const OTHER_RUNNA = 3;
const SNOTLINGS = [4, 5, 6];

async function firstHit(subject: HeadlessGame) {
  const coach = createPlannerCoach();
  for (let i = 0; i < 40; i++) {
    const { command } = await step(subject, coach);
    if (command.type === "block") {
      const target = subject.ctx.gameService.getPlayerById(command.defenderId);
      return target?.positionName ?? "unknown";
    }
    if (subject.ctx.gameService.getState().turn.teamId !== "team1") break;
  }
  return "no block";
}

const stunned = (
  playerIndex: number,
  x: number,
  y: number
): PlayerPlacement => ({
  playerIndex,
  x,
  y,
  status: PlayerStatus.STUNNED,
});

function comparableOdds(carrierMarkedByTroll: boolean) {
  const marked = carrierMarkedByTroll ? { hasBall: true as const } : {};
  return game({
    turn: 3,
    team2Roster: RosterName.SNOTLING,
    team1Placements: [
      {
        playerIndex: 0,
        x: 11,
        y: 5,
        stats: { ST: 1 },
        skills: [SkillType.BLOCK],
      },
      { playerIndex: 1, x: 5, y: 5, skills: [SkillType.BLOCK] },
      { playerIndex: 2, x: 7, y: 4 },
      { playerIndex: 3, x: 7, y: 6, ...marked },
    ],
    team2Placements: [
      { playerIndex: RUNNA, x: 12, y: 5 },
      { playerIndex: WAGON, x: 16, y: 1 },
      { playerIndex: SNOTLINGS[0] ?? 4, x: 16, y: 9 },
      { playerIndex: TROLL, x: 6, y: 5 },
    ],
  });
}

describe("a Snotling team down to its last ball handlers", () => {
  it("knocks down the Stilty Runna rather than the Troll on the same dice", async () => {
    expect(await firstHit(comparableOdds(false))).toBe("Stilty Runna");
  });

  it("still hits the Troll when he marks our ball carrier", async () => {
    expect(await firstHit(comparableOdds(true))).toBe("Trained Troll");
  });
});

function guardOrRunner(spares: readonly PlayerPlacement[]) {
  return game({
    turn: 3,
    team2Roster: RosterName.SNOTLING,
    team1Placements: [
      {
        playerIndex: 0,
        x: 15,
        y: 2,
        stats: { ST: 7 },
        skills: [SkillType.BLOCK],
      },
      stunned(1, 14, 0),
      stunned(2, 16, 0),
      stunned(3, 14, 1),
      stunned(4, 16, 1),
    ],
    team2Placements: [
      { playerIndex: TROLL, x: 15, y: 0, hasBall: true },
      { playerIndex: WAGON, x: 15, y: 1 },
      { playerIndex: RUNNA, x: 16, y: 3 },
      ...spares,
    ],
  });
}

const fourMoreHandlers: PlayerPlacement[] = [
  { playerIndex: OTHER_RUNNA, x: 5, y: 9 },
  ...SNOTLINGS.map((playerIndex, i) => ({ playerIndex, x: 3 + i, y: 7 })),
];

describe("the carrier's guard or the fast ball handler", () => {
  it("goes for the last fast ball handler", async () => {
    expect(await firstHit(guardOrRunner([]))).toBe("Stilty Runna");
  });

  it("breaks the cage when four more handlers could take his place", async () => {
    expect(await firstHit(guardOrRunner(fourMoreHandlers))).toBe("Pump Wagon");
  });
});

async function firstFoulSquare(subject: HeadlessGame) {
  const coach = createPlannerCoach();
  for (let i = 0; i < 20; i++) {
    const { command } = await step(subject, coach);
    if (command.type === "foul") return { x: command.x, y: command.y };
    if (subject.ctx.gameService.getState().turn.teamId !== "team1") break;
  }
  return null;
}

describe("two Stilty Runnas on the ground, one of them unable to carry the ball", () => {
  it("fouls the one who can still score", async () => {
    const subject = game({
      turn: 3,
      team2Roster: RosterName.SNOTLING,
      team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
      team2Placements: [
        {
          playerIndex: RUNNA,
          x: 11,
          y: 4,
          status: PlayerStatus.PRONE,
          skills: [SkillType.NO_BALL, SkillType.DODGE, SkillType.STUNTY],
        },
        {
          playerIndex: OTHER_RUNNA,
          x: 11,
          y: 6,
          status: PlayerStatus.PRONE,
          skills: [SkillType.DODGE, SkillType.STUNTY],
        },
        { playerIndex: TROLL, x: 3, y: 1 },
        { playerIndex: WAGON, x: 3, y: 9 },
      ],
    });
    expect(await firstFoulSquare(subject)).toEqual({ x: 11, y: 6 });
  });
});

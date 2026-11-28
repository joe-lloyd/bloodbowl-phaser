import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { GameService } from "../../src/services/GameService";
import { arenaTeam } from "../../src/scenes/sandboxTeam";
import { DEATHBOWL_FORMAT } from "../../src/game/variants/activeMatch";
import { placeBall, twoBalls } from "../../src/game/rules/balls";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { freshTurn } from "../../src/services/gameService/turnState";
import { PlayerStatus } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";
import { readBoard, toGoal } from "../../src/simulation/ai/board";
import {
  type Feature,
  evaluate,
  evaluationWeightsFor,
  features,
} from "../../src/simulation/ai/evaluate";
import type { Scenario } from "../../src/types/Scenario";
import type { MatchFormat } from "../../src/game/variants/activeMatch";

interface PairBoard {
  label: string;
  activeTeam: "team1" | "team2";
  ball: { x: number; y: number };
  team1: readonly { x: number; y: number }[];
  team2: readonly { x: number; y: number }[];
  format?: MatchFormat;
}

const PAIR_BOARDS: readonly PairBoard[] = [
  {
    label: "home carries in the middle",
    activeTeam: "team1",
    ball: { x: 10, y: 5 },
    team1: [
      { x: 10, y: 5 },
      { x: 9, y: 4 },
      { x: 9, y: 6 },
      { x: 4, y: 2 },
    ],
    team2: [
      { x: 11, y: 5 },
      { x: 12, y: 3 },
      { x: 15, y: 8 },
    ],
  },
  {
    label: "away carries near its line",
    activeTeam: "team1",
    ball: { x: 3, y: 7 },
    team1: [
      { x: 4, y: 7 },
      { x: 2, y: 2 },
      { x: 8, y: 5 },
    ],
    team2: [
      { x: 3, y: 7 },
      { x: 4, y: 8 },
      { x: 6, y: 6 },
    ],
  },
  {
    label: "a loose ball on the away turn",
    activeTeam: "team2",
    ball: { x: 12, y: 4 },
    team1: [
      { x: 11, y: 4 },
      { x: 7, y: 6 },
    ],
    team2: [
      { x: 15, y: 4 },
      { x: 14, y: 5 },
      { x: 17, y: 1 },
    ],
  },
  {
    label: "home carries on the long street",
    activeTeam: "team1",
    ball: { x: 18, y: 3 },
    team1: [
      { x: 18, y: 3 },
      { x: 17, y: 2 },
    ],
    team2: [
      { x: 20, y: 3 },
      { x: 23, y: 4 },
    ],
    format: { gameType: "street-bowl", venue: "street" },
  },
];

const placements = (squares: readonly { x: number; y: number }[]) =>
  squares.map(({ x, y }, playerIndex) => ({ playerIndex, x, y }));

function pairGame(board: PairBoard): HeadlessGame {
  const scenario: Scenario = {
    id: "coach-board",
    name: board.label,
    description: board.label,
    setup: {
      team1Placements: placements(board.team1),
      team2Placements: placements(board.team2),
      activeTeam: board.activeTeam,
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: board.ball,
    },
  };
  return new HeadlessGame({
    scenario,
    seed: 3,
    ...(board.format && { format: board.format }),
  });
}

const ZERO: Record<Feature, number> = {
  half2: 0,
  turns: 0,
  lead: 0,
  ours: 0,
  oursTurns: 0,
  oursToGoal: 0,
  oursMarks: 0,
  oursCorners: 0,
  oursInReach: 0,
  theirs: 0,
  theirsTurns: 0,
  theirsToGoal: 0,
  theirsMarkers: 0,
  theirsInReach: 0,
  loose: 0,
  looseNearer: 0,
  standingOurs: 0,
  standingTheirs: 0,
  outOurs: 0,
  outTheirs: 0,
  rerollsOurs: 0,
  rerollsTheirs: 0,
  leaderGap: 0,
  centre: 0,
};

const TWO_THIRDS = 0.6666666666666666;

const ON_MAIN = [
  {
    team1: {
      goals: [19, 12, 7],
      turnsLeft: 4,
      value: 0.2941857894736841,
      features: {
        turns: TWO_THIRDS,
        ours: 1,
        oursTurns: TWO_THIRDS,
        oursToGoal: 0.47368421052631576,
        oursMarks: 1,
        oursCorners: 2,
        standingOurs: 4,
        standingTheirs: 3,
      },
    },
    team2: {
      goals: [0, 7, 12],
      turnsLeft: 0,
      value: 0.015768947368421077,
      features: {
        theirs: 1,
        theirsToGoal: 0.47368421052631576,
        theirsMarkers: 1,
        standingOurs: 3,
        standingTheirs: 4,
      },
    },
  },
  {
    team1: {
      goals: [19, 12, 7],
      turnsLeft: 4,
      value: -0.26357035087719294,
      features: {
        turns: TWO_THIRDS,
        theirs: 1,
        theirsTurns: TWO_THIRDS,
        theirsToGoal: 0.15789473684210525,
        theirsMarkers: 1,
        theirsInReach: 1,
        standingOurs: 3,
        standingTheirs: 3,
      },
    },
    team2: {
      goals: [0, 7, 12],
      turnsLeft: 0,
      value: 0.8931152631578948,
      features: {
        ours: 1,
        oursToGoal: 0.15789473684210525,
        oursMarks: 1,
        oursCorners: 1,
        oursInReach: 1,
        standingOurs: 3,
        standingTheirs: 3,
      },
    },
  },
  {
    team1: {
      goals: [19, 12, 7],
      turnsLeft: 0,
      value: 0.10122800000000001,
      features: {
        loose: 1,
        looseNearer: 0.1,
        standingOurs: 2,
        standingTheirs: 3,
      },
    },
    team2: {
      goals: [0, 7, 12],
      turnsLeft: 4,
      value: 0.24652533333333332,
      features: {
        turns: TWO_THIRDS,
        loose: 1,
        looseNearer: -0.1,
        standingOurs: 3,
        standingTheirs: 2,
      },
    },
  },
  {
    team1: {
      goals: [25, 18, 7],
      turnsLeft: 4,
      value: 0.783998947368421,
      features: {
        turns: TWO_THIRDS,
        ours: 1,
        oursTurns: TWO_THIRDS,
        oursToGoal: 0.3684210526315789,
        oursCorners: 1,
        oursInReach: 1,
        standingOurs: 2,
        standingTheirs: 2,
      },
    },
    team2: {
      goals: [0, 7, 18],
      turnsLeft: 0,
      value: -0.2796652631578947,
      features: {
        theirs: 1,
        theirsToGoal: 0.3684210526315789,
        theirsInReach: 1,
        standingOurs: 2,
        standingTheirs: 2,
      },
    },
  },
] as const;

describe("the coach's board on a two-team pitch", () => {
  const cases = PAIR_BOARDS.flatMap((fixture, index) =>
    (["team1", "team2"] as const).map((us) => ({
      fixture,
      us,
      expected: ON_MAIN[index]?.[us],
    }))
  );

  it.each(cases)(
    "reads $fixture.label for $us exactly as main did",
    ({ fixture, us, expected }) => {
      const board = readBoard(pairGame(fixture), us);
      const them = us === "team1" ? "team2" : "team1";

      expect(board.rivals.map(({ team }) => team.id)).toEqual([them]);
      expect(board.lead).toBe(0);
      expect(board.turnsLeft).toBe(expected?.turnsLeft);
      expect(board.opponentTurnsLeft).toBe(6);
      expect([
        toGoal(board, { x: 0, y: 3 }),
        toGoal(board, { x: 7, y: 3 }),
        toGoal(board, { x: 7, y: 3 }, them),
      ]).toEqual(expected?.goals);
      expect(features(board)).toEqual({ ...ZERO, ...expected?.features });
      expect(evaluate(board)).toBe(expected?.value);
    }
  );

  it("keeps the fitted weights for every two-team match type", () => {
    for (const type of [
      "sevens",
      "gutter-bowl",
      "street-bowl",
      "beach-bowl",
    ] as const) {
      expect(evaluationWeightsFor(type).oursToGoal).toBe(-0.6238);
      expect(evaluationWeightsFor(type).bias).toBe(0.1554);
    }
    expect(evaluationWeightsFor("deathbowl").oursToGoal).toBe(-0.6238);
  });
});

const CARRIER = { x: 10, y: 8 };

const ARENA = [
  { id: "seat0", roster: RosterName.HUMAN, at: CARRIER },
  { id: "seat1", roster: RosterName.ORC, at: { x: 13, y: 10 } },
  { id: "seat2", roster: RosterName.SKAVEN, at: { x: 10, y: 13 } },
  { id: "seat3", roster: RosterName.DWARF, at: { x: 7, y: 10 } },
];

function arenaGame(): HeadlessGame {
  const teams = ARENA.map(({ id, roster, at }) => {
    const team = stabilizeIds(arenaTeam(roster, roster, 0xcc0000), id);
    const player = team.players[0];
    if (!player) throw new Error(`Seat ${id} has no players.`);
    player.gridPosition = { ...at };
    player.status = PlayerStatus.ACTIVE;
    return team;
  });
  const state = {
    ...GameService.createInitialState({ teams, startingPhase: GamePhase.PLAY }),
    ...DEATHBOWL_FORMAT,
    subPhase: SubPhase.TURN_RECEIVING,
    activeTeamId: "seat0",
    turn: freshTurn("seat0", 3),
    balls: twoBalls(),
  };
  placeBall(state, 0, CARRIER);
  placeBall(state, 1, { x: 10, y: 10 });
  return new HeadlessGame({ teams, initialState: state, seed: 5 });
}

describe("the coach's board from each seat of the Deathbowl arena", () => {
  it.each([
    {
      us: "seat0",
      rivals: ["seat1", "seat2", "seat3"],
      scores: { x: 10, y: 20 },
      own: { x: 10, y: 0 },
    },
    {
      us: "seat1",
      rivals: ["seat2", "seat3", "seat0"],
      scores: { x: 0, y: 10 },
      own: { x: 20, y: 10 },
    },
    {
      us: "seat2",
      rivals: ["seat3", "seat0", "seat1"],
      scores: { x: 10, y: 0 },
      own: { x: 10, y: 20 },
    },
    {
      us: "seat3",
      rivals: ["seat0", "seat1", "seat2"],
      scores: { x: 20, y: 10 },
      own: { x: 0, y: 10 },
    },
  ])("reads $us's rivals, both balls and its own goal (DB-P2)", (seat) => {
    const board = readBoard(arenaGame(), seat.us);

    expect(board.rivals.map(({ team }) => team.id)).toEqual(seat.rivals);
    expect(board.theirs.map(({ teamId }) => teamId)).toEqual(seat.rivals);
    expect(board.balls.map((ball) => [ball.id, ball.kind])).toEqual([
      [0, "carried"],
      [1, "loose"],
    ]);
    expect(toGoal(board, seat.scores)).toBe(0);
    expect(toGoal(board, seat.own)).toBe(20);
    expect(toGoal(board, { x: 10, y: 20 }, "seat0")).toBe(0);
    expect(toGoal(board, { x: 0, y: 10 }, "seat1")).toBe(0);
    expect(board.goalScale).toBe(20);
  });

  it("sums the features of both balls for the seat that carries one", () => {
    expect(features(readBoard(arenaGame(), "seat0"))).toEqual({
      ...ZERO,
      turns: 0.625,
      ours: 1,
      oursTurns: 0.625,
      oursToGoal: 0.6,
      oursInReach: 0,
      loose: 1,
      looseNearer: 0.1,
      standingOurs: 1,
      standingTheirs: 1,
      centre: 1,
    });
  });

  it("measures a rival's carrier in that rival's frame", () => {
    const f = features(readBoard(arenaGame(), "seat1"));

    expect(f.theirs).toBe(1);
    expect(f.theirsToGoal).toBe(0.6);
    expect(f.loose).toBe(1);
    expect(f.standingTheirs).toBe(1);
  });
});

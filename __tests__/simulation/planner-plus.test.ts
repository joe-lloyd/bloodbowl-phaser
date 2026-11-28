import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import type { HeadlessCommand, PendingDecision } from "../../src/headless/protocol";
import { GameService } from "../../src/services/GameService";
import { arenaTeam } from "../../src/scenes/sandboxTeam";
import { DEATHBOWL_FORMAT } from "../../src/game/variants/activeMatch";
import { placeBall, twoBalls } from "../../src/game/rules/balls";
import { freshSpend } from "../../src/game/rules/turnSpend";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { freshTurn } from "../../src/services/gameService/turnState";
import { PlayerStatus } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";
import { type Candidate, enumerateDecision } from "../../src/simulation/candidates";
import { createPlannerCoach, availableActions } from "../../src/simulation/ai/planner";
import { activations, planIdentity } from "../../src/simulation/ai/activations";
import { context } from "../../src/simulation/ai/activationContext";
import { roleSquares } from "../../src/simulation/ai/repositionActivations";
import { routesFor } from "../../src/simulation/ai/routes";
import { decide } from "../../src/simulation/ai/decisions";
import { features } from "../../src/simulation/ai/evaluate";
import { key, readBoard, sidelineGap } from "../../src/simulation/ai/board";
import { DEFAULT_WEIGHTS } from "../../src/simulation/ai/weights";
import { createCoachRng } from "../../src/simulation/rng";

interface Square {
  x: number;
  y: number;
}

interface Arena {
  readonly squads: readonly (readonly Square[])[];
  readonly balls: readonly [Square, Square];
  readonly points?: Record<string, number>;
  readonly blitzed?: readonly string[];
}

const SEATS = ["seat0", "seat1", "seat2", "seat3"] as const;
const ROSTERS = [RosterName.HUMAN, RosterName.ORC, RosterName.HUMAN, RosterName.ORC];

function plusGame({ squads, balls, points, blitzed = [] }: Arena): HeadlessGame {
  const teams = SEATS.map((id, seat) => {
    const team = stabilizeIds(arenaTeam(ROSTERS[seat] ?? RosterName.HUMAN, id, 0xcc0000), id);
    const squad = squads[seat] ?? [];
    for (const [index, at] of squad.entries()) {
      const player = team.players[index];
      if (!player) throw new Error(`${id} has no player ${String(index)}`);
      player.gridPosition = { ...at };
      player.status = PlayerStatus.ACTIVE;
    }
    return team;
  });
  const state = {
    ...GameService.createInitialState({ teams, startingPhase: GamePhase.PLAY }),
    ...DEATHBOWL_FORMAT,
    subPhase: SubPhase.TURN_RECEIVING,
    activeTeamId: "seat0",
    turn: { ...freshTurn("seat0", 3), spend: { ...freshSpend(), blitzed } },
    balls: twoBalls(),
    ...(points && { points }),
  };
  placeBall(state, 0, balls[0]);
  placeBall(state, 1, balls[1]);
  return new HeadlessGame({ teams, initialState: state, seed: 5 });
}

async function plansFor(game: HeadlessGame) {
  const point = await enumerateDecision(game, null);
  return activations({
    board: readBoard(game, "seat0"),
    w: DEFAULT_WEIGHTS,
    available: availableActions(point.candidates),
  });
}

const FAR = [{ x: 18, y: 10 }];

describe("the planner on the Deathbowl plus", () => {
  it("plans a pick-up of each ball for every player who can reach it (DB-B1)", async () => {
    const game = plusGame({
      squads: [[{ x: 9, y: 6 }, { x: 11, y: 14 }], FAR, [{ x: 10, y: 19 }], [{ x: 2, y: 10 }]],
      balls: [{ x: 11, y: 12 }, { x: 9, y: 8 }],
    });

    const plans = await plansFor(game);
    const pickups = plans
      .filter((plan) => plan.intent.kind === "pickup")
      .map((plan) => planIdentity(plan))
      .sort();

    expect(pickups).toEqual([
      "seat0-player-1/move/pickup/11,12",
      "seat0-player-1/move/pickup/9,8",
      "seat0-player-2/move/pickup/11,12",
      "seat0-player-2/move/pickup/9,8",
    ]);
  });

  it("keeps a carrier off the other ball, which it may not take (DB-B1)", async () => {
    const game = plusGame({
      squads: [[{ x: 10, y: 8 }], FAR, [{ x: 10, y: 19 }], [{ x: 2, y: 10 }]],
      balls: [{ x: 10, y: 8 }, { x: 10, y: 9 }],
    });
    const board = readBoard(game, "seat0");
    const carrier = board.ours[0];
    if (!carrier) throw new Error("seat0 has no carrier");

    expect(routesFor({ board, player: carrier }).has(key({ x: 10, y: 9 }))).toBe(false);
    const plans = await plansFor(game);
    expect(plans.filter((plan) => plan.intent.kind === "pickup")).toEqual([]);
  });

  it("screens a rival carrier towards the end zone that rival attacks (DB-P2)", () => {
    const game = plusGame({
      squads: [[{ x: 10, y: 4 }], [{ x: 13, y: 10 }], [{ x: 10, y: 19 }], [{ x: 2, y: 10 }]],
      balls: [{ x: 13, y: 10 }, { x: 5, y: 5 }],
    });
    const board = readBoard(game, "seat0");
    const c = context({ board, w: DEFAULT_WEIGHTS, available: new Map() });

    const screens = roleSquares(c)
      .filter((square) => square.role === "screen")
      .map(({ at }) => at);

    expect(screens).toEqual([
      { x: 11, y: 6 },
      { x: 11, y: 8 },
      { x: 11, y: 10 },
      { x: 11, y: 12 },
      { x: 11, y: 14 },
      { x: 9, y: 6 },
      { x: 9, y: 8 },
      { x: 9, y: 10 },
      { x: 9, y: 12 },
      { x: 9, y: 14 },
    ]);
  });

  it("blitzes the carrier of a team it has not blitzed yet this turn (DB-A1)", async () => {
    const game = plusGame({
      squads: [[{ x: 10, y: 6 }], [{ x: 12, y: 8 }], [{ x: 11, y: 10 }], [{ x: 8, y: 8 }]],
      balls: [{ x: 12, y: 8 }, { x: 8, y: 8 }],
      blitzed: ["seat1"],
    });
    const point = await enumerateDecision(game, null);
    const choice = await createPlannerCoach().choose({
      game,
      snapshot: game.snapshot(),
      point,
      rng: createCoachRng(1),
    });

    expect(point.candidates[choice.index]?.commands[0]).toEqual({
      type: "declare-action",
      playerId: "seat0-player-1",
      action: "blitz",
      against: "seat3",
    });
  });
});

const lend = (toAttacker: string[], toDefender: string[]): Candidate => ({
  kind: "decision",
  commands: [{ type: "lend-assists", toAttacker, toDefender }],
  label: "lend",
});

const CROSS_ASSIST: PendingDecision = {
  type: "cross-assist",
  chooserTeamId: "seat2",
  attackerId: "seat0-player-1",
  defenderId: "seat1-player-1",
  action: "block",
  offers: [{ playerId: "seat2-player-1", sides: ["attacker", "defender"] }],
};

const LENDS = [lend(["seat2-player-1"], []), lend([], ["seat2-player-1"]), lend([], [])];

function crossAssistAnswer(points: Record<string, number>): HeadlessCommand | undefined {
  const game = plusGame({
    squads: [[{ x: 10, y: 9 }], [{ x: 10, y: 10 }], [{ x: 11, y: 11 }], [{ x: 2, y: 10 }]],
    balls: [{ x: 5, y: 5 }, { x: 15, y: 15 }],
    points,
  });
  const index = decide({ board: readBoard(game, "seat2"), pending: CROSS_ASSIST, candidates: LENDS });
  return index === null ? undefined : LENDS[index]?.commands[0];
}

describe("cross-team assists from a computer coach (DB-A4)", () => {
  it("lends to the defender when the attacker leads on points", () => {
    expect(crossAssistAnswer({ seat0: 12, seat1: 3 })).toEqual({
      type: "lend-assists",
      toAttacker: [],
      toDefender: ["seat2-player-1"],
    });
  });

  it("lends to the attacker when the defender leads on points", () => {
    expect(crossAssistAnswer({ seat0: 3, seat1: 12 })).toEqual({
      type: "lend-assists",
      toAttacker: ["seat2-player-1"],
      toDefender: [],
    });
  });

  it("lends against the side with more points when a third team leads", () => {
    expect(crossAssistAnswer({ seat0: 2, seat1: 6, seat2: 20 })).toEqual({
      type: "lend-assists",
      toAttacker: ["seat2-player-1"],
      toDefender: [],
    });
  });

  it("lends to nobody when attacker and defender share the lead", () => {
    expect(crossAssistAnswer({ seat0: 7, seat1: 7 })).toEqual({
      type: "lend-assists",
      toAttacker: [],
      toDefender: [],
    });
  });

  it("lends to the defender when nobody has scored", () => {
    expect(crossAssistAnswer({})).toEqual({
      type: "lend-assists",
      toAttacker: [],
      toDefender: ["seat2-player-1"],
    });
  });
});

describe("reserves after a scoring turn (DB-F4)", () => {
  it("brings the strongest reserve on at the line square nearest the centre", () => {
    const game = plusGame({
      squads: [[{ x: 10, y: 9 }], FAR, [{ x: 10, y: 19 }], [{ x: 2, y: 10 }]],
      balls: [{ x: 5, y: 5 }, { x: 15, y: 15 }],
    });
    const [weak, strong] = ["seat0-player-2", "seat0-player-3"].map((id) =>
      game.ctx.gameService.getPlayerById(id)
    );
    if (!weak || !strong) throw new Error("seat0 has too few reserves");
    weak.stats.ST = 3;
    strong.stats.ST = 4;
    const squares = [
      { x: 7, y: 5 },
      { x: 10, y: 5 },
      { x: 12, y: 5 },
    ];
    const candidates: Candidate[] = [weak, strong].flatMap((player) =>
      squares.map(({ x, y }) => ({
        kind: "decision" as const,
        commands: [{ type: "move-reserve" as const, playerId: player.id, x, y }],
        label: "reserve",
      }))
    );
    const index = decide({
      board: readBoard(game, "seat0"),
      pending: { type: "reserve-move", chooserTeamId: "seat0", playerIds: [weak.id, strong.id], squares },
      candidates,
    });

    expect(index === null ? undefined : candidates[index]?.commands[0]).toEqual({
      type: "move-reserve",
      playerId: "seat0-player-3",
      x: 10,
      y: 5,
    });
  });
});

describe("the crowd on the plus (DB-P1)", () => {
  it("measures a square's gap to the crowd from every side of the plus", () => {
    const board = readBoard(
      plusGame({ squads: [[{ x: 10, y: 9 }], FAR, [{ x: 10, y: 19 }], [{ x: 2, y: 10 }]], balls: [{ x: 5, y: 5 }, { x: 15, y: 15 }] }),
      "seat0"
    );
    const squares = [
      { x: 10, y: 10 },
      { x: 10, y: 17 },
      { x: 10, y: 19 },
      { x: 10, y: 20 },
      { x: 6, y: 17 },
      { x: 5, y: 17 },
      { x: 17, y: 5 },
    ];

    expect(squares.map((at) => sidelineGap(board, at))).toEqual([2, 2, 1, 0, 1, 0, 0]);
  });
});

describe("the Deathbowl evaluation features", () => {
  it("reads the gap to the points leader and who holds the centre", () => {
    const game = plusGame({
      squads: [
        [{ x: 10, y: 9 }, { x: 9, y: 11 }],
        [{ x: 12, y: 10 }],
        [{ x: 10, y: 15 }],
        [{ x: 8, y: 8 }, { x: 11, y: 12 }],
      ],
      balls: [{ x: 5, y: 5 }, { x: 15, y: 15 }],
      points: { seat0: 4, seat1: 9, seat2: 14 },
    });

    const f = features(readBoard(game, "seat0"));

    expect(f.leaderGap).toBe(-1);
    expect(f.lead).toBe(-1);
    expect(f.centre).toBe(1);
  });
});

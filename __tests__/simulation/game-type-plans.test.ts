import { describe, expect, it } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerCondition, PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { RosterName } from "../../src/types/Team";
import {
  enumerateDecision,
  type Candidate,
} from "../../src/simulation/candidates";
import {
  availableActions,
  createPlannerCoach,
} from "../../src/simulation/ai/planner";
import { activations } from "../../src/simulation/ai/activations";
import { projectBoard, readBoard } from "../../src/simulation/ai/board";
import { DEFAULT_WEIGHTS } from "../../src/simulation/ai/weights";
import { casualtyChance } from "../../src/simulation/ai/chance";
import { inducementChoice } from "../../src/simulation/ai/inducementChoices";
import { createCoachRng } from "../../src/simulation/rng";
import {
  SEVENS_FORMAT,
  type MatchFormat,
  withMatchFormat,
} from "../../src/game/variants/activeMatch";
import type { PendingDecision } from "../../src/headless/protocol";
import type { InducementChoiceKind } from "../../src/types/decisions";
import { blockFaces } from "../../src/simulation/ai/wrestle";
import { decide } from "../../src/simulation/ai/decisions";
import {
  BEACH,
  GUTTER_SEWER,
  GUTTER_STREET,
  STREET,
  STREET_SETUP,
  variantGame,
} from "../headless/variantKickoffs";

function foulGame(format: MatchFormat) {
  return new HeadlessGame({
    seed: 1,
    format,
    scenario: {
      id: "game-type-foul",
      name: "A lone foul on any pitch",
      description: "",
      setup: {
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        activeTeam: "team1",
        turn: 2,
        team1Roster: RosterName.ORC,
        teamRerolls: { team1: 0, team2: 0 },
        team1Placements: [{ playerIndex: 0, x: 11, y: 6 }],
        team2Placements: [
          {
            playerIndex: 0,
            x: 12,
            y: 6,
            status: PlayerStatus.PRONE,
            stats: { AV: 8 },
            skills: [],
          },
          { playerIndex: 1, x: 14, y: 0, hasBall: true },
        ],
      },
    },
  });
}

const rounded = (value: number | null, places = 3) =>
  value === null ? null : Number(value.toFixed(places));

async function foulValue(format: MatchFormat): Promise<number | null> {
  const subject = foulGame(format);
  const point = await enumerateDecision(subject, null);
  const foul = activations({
    board: readBoard(subject, "team1"),
    w: DEFAULT_WEIGHTS,
    available: availableActions(point.candidates),
  }).find((a) => a.action === "foul");
  return rounded(foul?.value ?? null);
}

describe("game type rules in the planner's prices", () => {
  it("prices the same lone Foul by each game type's referee and retribution", async () => {
    const values = {
      sevens: await foulValue(SEVENS_FORMAT),
      street: await foulValue(STREET),
      beach: await foulValue(BEACH),
      gutter: await foulValue(GUTTER_STREET),
    };
    expect(values).toEqual({
      sevens: 1.574,
      street: 5.833,
      beach: null,
      gutter: 7.5,
    });
  });

  it("adds the cobbles to a knockdown's casualty odds", () => {
    const game = new HeadlessGame({ seed: 1 });
    const attacker = { ...fixtureValue(game.ctx.team1.players[0]), skills: [] };
    const defender = {
      ...fixtureValue(game.ctx.team2.players[0]),
      stats: { ...fixtureValue(game.ctx.team2.players[0]).stats, AV: 9 },
      skills: [],
    };
    const odds = (format: MatchFormat) =>
      rounded(
        withMatchFormat(format, () => casualtyChance(attacker, defender) * 1296)
      );
    expect([odds(SEVENS_FORMAT), odds(STREET), odds(GUTTER_STREET)]).toEqual([
      60, 90, 90,
    ]);
  });

  async function kickRow(coach = createPlannerCoach()) {
    const game = variantGame({ format: STREET, setup: STREET_SETUP });
    const point = await enumerateDecision(game, "team1");
    const choice = await coach.choose({
      game,
      snapshot: game.snapshot(),
      point,
      rng: createCoachRng(1),
    });
    const [command] = fixtureValue(point.candidates[choice.index]).commands;
    return command.type === "kick-ball" ? command.y : null;
  }

  it("kicks to the middle row of the seven-row Street Bowl pitch, unless its game type weights say wide", async () => {
    const wide = createPlannerCoach({
      gameTypes: { "street-bowl": { kickWide: 1 } },
    });
    const sevensOnly = createPlannerCoach({
      gameTypes: { sevens: { kickWide: 1 } },
    });
    expect([
      await kickRow(),
      await kickRow(wide),
      await kickRow(sevensOnly),
    ]).toEqual([3, 5, 3]);
  });
});

type Choice = Extract<PendingDecision, { type: "inducement-choice" }>;

function choose(game: HeadlessGame, pending: Choice): string | null {
  const candidates: Candidate[] = [
    ...pending.playerIds.flatMap((playerId) =>
      (pending.skills ?? [undefined]).map(
        (skill): Candidate => ({
          kind: "decision",
          commands: [
            {
              type: "choose-inducement",
              playerId,
              ...(skill !== undefined && { skill }),
            },
          ],
          label: `${playerId} ${skill ?? ""}`,
        })
      )
    ),
    {
      kind: "decision",
      commands: [{ type: "choose-inducement" }],
      label: "keep",
    },
  ];
  const index = inducementChoice(
    readBoard(game, pending.chooserTeamId),
    pending,
    candidates
  );
  if (index === null) return "planner";
  return fixtureValue(candidates[index]).label;
}

function pendingFor(
  game: HeadlessGame,
  kind: InducementChoiceKind,
  extra: Partial<Choice> = {}
): Choice {
  return {
    type: "inducement-choice",
    kind,
    chooserTeamId: "team1",
    playerIds: game.ctx.team1.players.map((p) => p.id),
    optional: true,
    ...extra,
  };
}

describe("computer inducement choices", () => {
  function streetSquad() {
    const game = variantGame({ format: STREET, setup: STREET_SETUP });
    const [lineman, , , blitzer] = game.ctx.team1.players;
    fixtureValue(blitzer).cost = 85_000;
    return {
      game,
      lineman: fixtureValue(lineman),
      blitzer: fixtureValue(blitzer),
    };
  }

  it("gives a Magic Potion to the most valuable casualty, and keeps it when nobody is hurt", () => {
    const { game, lineman, blitzer } = streetSquad();
    const fit = choose(game, pendingFor(game, "magic-potion"));
    lineman.status = PlayerStatus.INJURED;
    blitzer.status = PlayerStatus.INJURED;
    const hurt = choose(game, pendingFor(game, "magic-potion"));
    expect([fit, hurt]).toEqual(["keep", `${blitzer.id} `]);
  });

  it("casts the Novice Wizard's Transmutation only at the opposing ball carrier", () => {
    const { game } = streetSquad();
    const targets = { playerIds: game.ctx.team2.players.map((p) => p.id) };
    const wizard = pendingFor(game, "novice-wizard", {
      ...targets,
      skills: ["Firebolt", "Transmutation"],
    });
    const noCarrier = choose(game, wizard);
    const carrier = fixtureValue(game.ctx.team2.players[0]);
    game.ctx.gameService.getState().ballPosition = {
      ...fixtureValue(carrier.gridPosition),
    };
    expect([noCarrier, choose(game, wizard)]).toEqual([
      "keep",
      `${carrier.id} Transmutation`,
    ]);
  });
});

function pinGame(
  format: MatchFormat,
  attacker: { x: number; y: number; skills?: SkillType[] },
  defender: {
    x: number;
    y: number;
    skills?: SkillType[];
    conditions?: PlayerCondition[];
  }
) {
  return new HeadlessGame({
    seed: 1,
    format,
    scenario: {
      id: "pinned-push",
      name: "A defender with nowhere to be pushed",
      description: "",
      setup: {
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        activeTeam: "team1",
        turn: 2,
        teamRerolls: { team1: 0, team2: 0 },
        team1Placements: [
          {
            playerIndex: 0,
            x: attacker.x,
            y: attacker.y,
            skills: attacker.skills ?? [],
          },
        ],
        team2Placements: [
          {
            playerIndex: 0,
            x: defender.x,
            y: defender.y,
            skills: defender.skills ?? [],
            conditions: defender.conditions ?? [],
          },
        ],
      },
    },
  });
}

function pushKnockdown(
  format: MatchFormat,
  attacker: {
    x: number;
    y: number;
    skills?: SkillType[];
    to?: { x: number; y: number };
    blitz?: boolean;
  },
  defender: {
    x: number;
    y: number;
    skills?: SkillType[];
    conditions?: PlayerCondition[];
  }
): number {
  const game = pinGame(format, attacker, defender);
  const placed = fixtureValue(game.ctx.team1.players[0]);
  return blockFaces(readBoard(game, "team1"), {
    attacker: attacker.to ? { ...placed, gridPosition: attacker.to } : placed,
    defender: fixtureValue(game.ctx.team2.players[0]),
    blitz: attacker.blitz ?? false,
  }).push.knockdown;
}

describe("pushes with nowhere to go", () => {
  it("counts a push into a wall as half a knockdown, and a pit or the crowd as a whole one", () => {
    expect({
      open: pushKnockdown(STREET, { x: 5, y: 4 }, { x: 5, y: 3 }),
      wall: pushKnockdown(STREET, { x: 5, y: 1 }, { x: 5, y: 0 }),
      pit: pushKnockdown(GUTTER_SEWER, { x: 11, y: 3 }, { x: 10, y: 3 }),
      crowd: pushKnockdown(SEVENS_FORMAT, { x: 5, y: 1 }, { x: 5, y: 0 }),
    }).toEqual({ open: 0, wall: 0.5, pit: 1, crowd: 1 });
  });

  it("lets a Sidestep defender slip the wall, and reads the attacker's own vacated square as open", () => {
    expect({
      sidestep: pushKnockdown(
        STREET,
        { x: 5, y: 1 },
        { x: 5, y: 0, skills: [SkillType.SIDESTEP] }
      ),
      vacated: pushKnockdown(
        STREET,
        { x: 4, y: 0, to: { x: 6, y: 1 } },
        { x: 5, y: 0 }
      ),
    }).toEqual({ sidestep: 0, vacated: 0 });
  });
});

describe("block dice against a Sidestep defender on the sideline", () => {
  it("takes Both Down over a Push the Sidestep would escape", () => {
    const game = pinGame(
      SEVENS_FORMAT,
      { x: 0, y: 1, skills: [SkillType.BLOCK] },
      { x: 0, y: 0, skills: [SkillType.SIDESTEP] }
    );
    const faces = blockFaces(readBoard(game, "team1"), {
      attacker: fixtureValue(game.ctx.team1.players[0]),
      defender: fixtureValue(game.ctx.team2.players[0]),
    });
    expect({
      push: faces.push.knockdown,
      prefersBothDown: faces["both-down"].rank > faces.push.rank,
    }).toEqual({ push: 0, prefersBothDown: true });
  });

  it("prices no pin when Grab lets the attacker use an open square, or the defender has taken root", () => {
    const grabbed = pushKnockdown(
      SEVENS_FORMAT,
      { x: 0, y: 1, skills: [SkillType.BLOCK, SkillType.GRAB] },
      { x: 0, y: 0, skills: [SkillType.SIDESTEP] }
    );
    const rooted = pushKnockdown(
      SEVENS_FORMAT,
      { x: 0, y: 1 },
      { x: 0, y: 0, conditions: [PlayerCondition.ROOTED] }
    );
    const grabBlitz = pushKnockdown(
      SEVENS_FORMAT,
      { x: 0, y: 1, skills: [SkillType.BLOCK, SkillType.GRAB], blitz: true },
      { x: 0, y: 0 }
    );
    const distracted = pushKnockdown(
      SEVENS_FORMAT,
      { x: 0, y: 1 },
      {
        x: 0,
        y: 0,
        skills: [SkillType.SIDESTEP],
        conditions: [PlayerCondition.DISTRACTED],
      }
    );
    const standFirm = (attacker: { skills: SkillType[]; blitz: boolean }) =>
      pushKnockdown(
        SEVENS_FORMAT,
        { x: 0, y: 1, ...attacker },
        { x: 0, y: 0, skills: [SkillType.STAND_FIRM] }
      );
    expect({
      grabbed,
      rooted,
      grabBlitz,
      distracted,
      standFirmBlock: standFirm({
        skills: [SkillType.JUGGERNAUT],
        blitz: false,
      }),
      standFirmJuggernautBlitz: standFirm({
        skills: [SkillType.JUGGERNAUT],
        blitz: true,
      }),
    }).toEqual({
      grabbed: 0,
      rooted: 0,
      grabBlitz: 1,
      distracted: 1,
      standFirmBlock: 0,
      standFirmJuggernautBlitz: 1,
    });
  });
});

describe("push choices on a walled pitch", () => {
  it("pushes into the crowd past the end line before the sideline wall", () => {
    const game = pinGame(STREET, { x: 0, y: 1 }, { x: 0, y: 0 });
    const attacker = fixtureValue(game.ctx.team1.players[0]);
    const defender = fixtureValue(game.ctx.team2.players[0]);
    const options = [
      { x: 0, y: -1 },
      { x: -1, y: -1 },
      { x: 1, y: -1 },
    ];
    const candidates: Candidate[] = options.map((square) => ({
      kind: "decision",
      commands: [{ type: "choose-push-direction", ...square }],
      label: `${String(square.x)},${String(square.y)}`,
    }));
    const index = decide({
      board: readBoard(game, "team1"),
      pending: {
        type: "push-direction",
        attackerId: attacker.id,
        defenderId: defender.id,
        resultType: "push",
        options,
      },
      candidates,
    });
    expect([
      pushKnockdown(STREET, { x: 0, y: 1 }, { x: 0, y: 0 }),
      fixtureValue(candidates[index ?? -1]).label,
    ]).toEqual([1, "-1,-1"]);
  });
});

async function stationaryBlitzValues(movementUsed: (ma: number) => number) {
  const subject = new HeadlessGame({
    seed: 1,
    scenario: {
      id: "grab-carrier-blitz",
      name: "A Grab carrier blitzes its marker on the sideline",
      description: "",
      setup: {
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        activeTeam: "team1",
        turn: 2,
        teamRerolls: { team1: 0, team2: 0 },
        team1Placements: [
          {
            playerIndex: 0,
            x: 0,
            y: 1,
            hasBall: true,
            stats: { ST: 4 },
            skills: [SkillType.GRAB],
          },
        ],
        team2Placements: [
          {
            playerIndex: 0,
            x: 0,
            y: 0,
            skills: [SkillType.BLOCK, SkillType.DODGE],
          },
        ],
      },
    },
  });
  const carrier = fixtureValue(subject.ctx.team1.players[0]);
  subject.ctx.gameService
    .getState()
    .turn.movementUsed.set(carrier.id, movementUsed(carrier.stats.MA));
  const point = await enumerateDecision(subject, null);
  return activations({
    board: readBoard(subject, "team1"),
    w: DEFAULT_WEIGHTS,
    available: availableActions(point.candidates),
  })
    .filter(
      (a) =>
        a.action === "blitz" &&
        a.intent.kind === "blitz" &&
        a.intent.route === null
    )
    .map((a) => Math.round(a.value));
}

describe("a carrier's Blitz on a marker", () => {
  it("prices a Grab carrier's Blitz by the Blitz's push rules, and charges the Rush to the block square", async () => {
    expect({
      fresh: await stationaryBlitzValues(() => 0),
      rushToHit: await stationaryBlitzValues((ma) => ma),
      noMovementLeft: await stationaryBlitzValues((ma) => ma + 2),
    }).toEqual({ fresh: [16], rushToHit: [], noMovementLeft: [] });
  });
});

describe("pushes priced on the board the move leaves", () => {
  it("sees the square a helper fills, and a Juggernaut Blitz's Both Down as a Push", () => {
    const game = new HeadlessGame({
      seed: 1,
      scenario: {
        id: "projected-push",
        name: "A helper fills the only open push square",
        description: "",
        setup: {
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
          activeTeam: "team1",
          turn: 2,
          teamRerolls: { team1: 0, team2: 0 },
          team1Placements: [
            { playerIndex: 0, x: 3, y: 1, skills: [SkillType.JUGGERNAUT] },
            { playerIndex: 1, x: 6, y: 0 },
          ],
          team2Placements: [
            {
              playerIndex: 0,
              x: 4,
              y: 0,
              skills: [SkillType.BLOCK, SkillType.STAND_FIRM],
            },
          ],
        },
      },
    });
    const board = readBoard(game, "team1");
    const attacker = fixtureValue(
      board.ours.find((p) => p.gridPosition.x === 3)
    );
    const helper = fixtureValue(board.ours.find((p) => p.gridPosition.x === 6));
    const defender = fixtureValue(board.theirs[0]);
    const filled = projectBoard(board, [
      { player: helper, at: { x: 5, y: 0 } },
    ]);
    const face = (b: typeof board, blitz: boolean) =>
      blockFaces(b, { attacker, defender, blitz });
    expect({
      openBlitz: face(board, true).push.knockdown,
      filledBlitz: face(filled, true).push.knockdown,
      filledBothDownBlitz: face(filled, true)["both-down"],
      filledBothDownBlock: face(filled, false)["both-down"],
    }).toEqual({
      openBlitz: 0,
      filledBlitz: 1,
      filledBothDownBlitz: { rank: 4.4, knockdown: 1, attackerDown: false },
      filledBothDownBlock: { rank: 0.5, knockdown: 0, attackerDown: true },
    });
  });
});

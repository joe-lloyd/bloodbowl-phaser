import { describe, expect, it } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
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
import { readBoard } from "../../src/simulation/ai/board";
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
import {
  BEACH,
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

async function foulValue(format: MatchFormat): Promise<number | null> {
  const subject = foulGame(format);
  const point = await enumerateDecision(subject, null);
  const fouls = activations({
    board: readBoard(subject, "team1"),
    w: DEFAULT_WEIGHTS,
    available: availableActions(point.candidates),
  }).filter((a) => a.action === "foul");
  return fouls[0]?.value ?? null;
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
      sevens: expect.closeTo(1.574, 3),
      street: expect.closeTo(5.833, 3),
      beach: null,
      gutter: expect.closeTo(7.5, 3),
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
      withMatchFormat(format, () => casualtyChance(attacker, defender) * 1296);
    expect([odds(SEVENS_FORMAT), odds(STREET), odds(GUTTER_STREET)]).toEqual([
      expect.closeTo(60, 9),
      expect.closeTo(90, 9),
      expect.closeTo(90, 9),
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
              ...(skill === undefined ? {} : { skill }),
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

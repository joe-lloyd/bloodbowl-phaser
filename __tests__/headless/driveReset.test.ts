import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { type Scenario } from "../../src/types/Scenario";
import { PlayerCondition, PlayerStatus } from "../../src/types/Player";
import { deserializeGameState } from "../../src/headless/serialization";
import { forceDice } from "../utils/test-helpers";

const tdScenario: Scenario = {
  id: "td-drive-reset",
  name: "TD drive reset",
  description: "carrier walks into the end zone",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 17, y: 5 },
      { playerIndex: 1, x: 15, y: 3 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 13, y: 9 },
      { playerIndex: 1, x: 14, y: 2, status: PlayerStatus.STUNNED },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 17, y: 5 },
  },
};

async function scoreTouchdown(game: HeadlessGame) {
  const carrier = fixtureValue(game.snapshot().teams[0]).players[0];
  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(carrier).id,
    action: "move",
  });
  return game.execute({
    type: "move",
    playerId: fixtureValue(carrier).id,
    path: [
      { x: 18, y: 5 },
      { x: 19, y: 5 },
    ],
  });
}

async function placeTeam(game: HeadlessGame, teamId: string): Promise<void> {
  const zone = fixtureValue(game.ctx.gameService.getSetupZone(teamId));
  const snap = game.snapshot();
  const team = fixtureValue(snap.teams.find((t) => t.id === teamId));
  const eligible = team.players.filter(
    (p) => p.status === "Active" || p.status === "Reserve"
  );
  const toPlace = eligible.filter((p) => !p.position).slice(0, 7);
  const occupied = new Set(
    snap.teams
      .flatMap((t) => t.players)
      .filter((p) => p.position)
      .map(
        (p) =>
          `${String(fixtureValue(p.position).x)},${String(fixtureValue(p.position).y)}`
      )
  );
  const isTeam1 = teamId === fixtureValue(snap.teams[0]).id;
  const lineX = isTeam1 ? zone.maxX : zone.minX;
  let placed = 0;
  outer: for (
    let x = lineX;
    x >= zone.minX && x <= zone.maxX;
    x += isTeam1 ? -1 : 1
  ) {
    for (let y = 2; y <= 8; y++) {
      if (placed >= toPlace.length) break outer;
      if (occupied.has(`${String(x)},${String(y)}`)) continue;
      const r = await game.execute({
        type: "place-player",
        playerId: fixtureValue(toPlace[placed]).id,
        x,
        y,
      });
      if (r.ok) {
        occupied.add(`${String(x)},${String(y)}`);
        placed++;
      }
    }
  }
}

const endTurns = async (game: HeadlessGame, turns: number) => {
  for (let turn = 0; turn < turns; turn++)
    await game.execute({ type: "end-turn" });
};

const DRIVE_ENDS = [
  {
    name: "the active team scores",
    prepare: () => Promise.resolve(),
    end: scoreTouchdown,
  },
  {
    name: "the other team scores",
    prepare: () => Promise.resolve(),
    end: async (game: HeadlessGame) => {
      const { gameService, team2 } = game.ctx;
      gameService.addTouchdown(team2.id, fixtureValue(team2.players[0]).id);
      await gameService.getFlowContext().flowManager.whenIdle();
    },
  },
  {
    name: "half-time",
    prepare: async (game: HeadlessGame) => {
      game.ctx.gameService.startGame(game.ctx.team1.id);
      await endTurns(game, 11);
    },
    end: (game: HeadlessGame) => endTurns(game, 1),
  },
  {
    name: "extra time",
    prepare: async (game: HeadlessGame) => {
      game.ctx.gameService.getState().knockout = true;
      game.ctx.gameService.getState().turn.isHalf2 = true;
      game.ctx.gameService.startGame(game.ctx.team1.id);
      await endTurns(game, 11);
    },
    end: (game: HeadlessGame) => endTurns(game, 1),
  },
];

describe("drive reset", () => {
  it.each(DRIVE_ENDS)(
    "resets every player and the whole turn when $name",
    async ({ prepare, end }) => {
      const game = new HeadlessGame({ scenario: tdScenario, seed: 3 });
      const { team1, team2, gameService } = game.ctx;
      await prepare(game);
      const state = gameService.getState();
      for (const [index, team] of [team1, team2].entries()) {
        const [, prone, stunned, knockedOut, casualty, sentOff] =
          team.players;
        Object.assign(fixtureValue(prone), {
          status: PlayerStatus.PRONE,
          gridPosition: { x: 3 + index, y: 1 },
          hasActed: true,
        });
        Object.assign(fixtureValue(stunned), {
          status: PlayerStatus.STUNNED,
          gridPosition: { x: 3 + index, y: 2 },
          hasActed: true,
          conditions: [{ type: PlayerCondition.DISTRACTED }],
        });
        for (const [player, status] of [
          [knockedOut, PlayerStatus.KO],
          [casualty, PlayerStatus.INJURED],
          [sentOff, PlayerStatus.REMOVED],
        ] as const) {
          fixtureValue(player).status = status;
          delete fixtureValue(player).gridPosition;
        }
        for (const player of team.players.slice(1, 3)) {
          state.turn.activatedPlayerIds.add(player.id);
          state.turn.movementUsed.set(player.id, 3);
        }
      }
      state.turn.hasBlitzed = true;
      state.turn.hasFouled = true;
      state.turnUsage = { turn: "h1", teams: [team1.id], once: [], uses: {} };

      const recovered = new Map<string, boolean>();
      game.ctx.eventBus.on(GameEventNames.KORecoveryRolled, (roll) => {
        recovered.set(roll.playerId, roll.recovered);
      });
      await end(game);

      expect(state.phase).not.toBe(GamePhase.PLAY);
      expect(recovered.size).toBe(2);
      for (const player of [...team1.players, ...team2.players]) {
        expect(player.gridPosition).toBeUndefined();
        expect(player.hasActed).toBe(false);
        expect(player.conditions ?? []).toEqual([]);
      }
      for (const team of [team1, team2]) {
        const statuses = team.players.map((player) => player.status);
        expect(statuses.slice(3, 6)).toEqual([
          recovered.get(fixtureValue(team.players[3]).id)
            ? PlayerStatus.RESERVE
            : PlayerStatus.KO,
          PlayerStatus.INJURED,
          PlayerStatus.REMOVED,
        ]);
        expect(new Set([...statuses.slice(0, 3), ...statuses.slice(6)])).toEqual(
          new Set([PlayerStatus.RESERVE])
        );
      }
      for (const turn of [
        state.turn,
        deserializeGameState(game.snapshot()).turn,
      ]) {
        expect(turn.activatedPlayerIds.size).toBe(0);
        expect(turn.movementUsed.size).toBe(0);
        expect(turn).toMatchObject({ hasBlitzed: false, hasFouled: false });
      }
      expect(state.turnUsage).toBeUndefined();
      expect(state.activePlayer).toBeNull();
    }
  );

  it("clears the pitch after a touchdown: dugouts, no ball, placements reset", async () => {
    const game = new HeadlessGame({ scenario: tdScenario, seed: 3 });
    const response = await scoreTouchdown(game);
    expect(response.ok).toBe(true);

    const snap = response.snapshot;
    const everyone = snap.teams.flatMap((t) => t.players);
    expect(everyone.every((p) => p.position === null)).toBe(true);
    expect(snap.ballPosition).toBeNull();

    expect(
      everyone
        .filter((p) => p.status !== "KO" && p.status !== "Injured")
        .every((p) => p.status === "Reserve")
    ).toBe(true);

    expect(
      game.ctx.gameService.isSetupComplete(fixtureValue(snap.teams[0]).id)
    ).toBe(false);
  });

  it("rolls KO recovery with per-player events and correct outcomes", async () => {
    let sawRecovered = false;
    let sawStuckOut = false;

    for (let seed = 1; seed <= 40 && !(sawRecovered && sawStuckOut); seed++) {
      const game = new HeadlessGame({ scenario: tdScenario, seed });

      fixtureValue(game.ctx.team1.players[3]).status = PlayerStatus.KO;
      fixtureValue(game.ctx.team2.players[3]).status = PlayerStatus.KO;

      const response = await scoreTouchdown(game);
      const rolls = response.events.filter(
        (e) => e.name === GameEventNames.KORecoveryRolled
      );
      expect(rolls).toHaveLength(2);

      for (const event of rolls) {
        const data = z
          .object({
            playerId: z.string(),
            roll: z.number(),
            recovered: z.boolean(),
          })
          .parse(event.data);
        expect(data.recovered).toBe(data.roll >= 4);
        const player = fixtureValue(
          game.ctx.gameService.getPlayerById(data.playerId)
        );
        if (data.recovered) {
          expect(player.status).toBe(PlayerStatus.RESERVE);
          sawRecovered = true;
        } else {
          expect(player.status).toBe(PlayerStatus.KO);
          sawStuckOut = true;
        }
      }
    }
    expect(sawRecovered).toBe(true);
    expect(sawStuckOut).toBe(true);
  });

  it("scoring team kicks the next drive, with no coin flip", async () => {
    const game = new HeadlessGame({ scenario: tdScenario, seed: 4 });
    const scorerTeamId = fixtureValue(game.snapshot().teams[0]).id;
    const response = await scoreTouchdown(game);

    expect(response.snapshot.phase).toBe(GamePhase.SETUP);
    expect(response.snapshot.subPhase).toBe(SubPhase.SETUP_KICKING);
    expect(response.snapshot.activeTeamId).toBe(scorerTeamId);
    expect(
      response.events.some(
        (e) =>
          e.name === GameEventNames.DriveEnded &&
          z.object({ reason: z.string() }).parse(e.data).reason === "touchdown"
      )
    ).toBe(true);

    const flip = await game.execute({ type: "coin-flip" });
    expect(flip.ok).toBe(false);
    expect(flip.reason).toContain("coin-flip-only-before-first-drive");
  });

  it("scores a touchdown on a catch made in the end zone", async () => {
    const catchScenario: Scenario = {
      id: "td-catch",
      name: "TD catch",
      description: "receiver standing in the end zone catches a pass",
      setup: {
        team1Placements: [
          { playerIndex: 0, x: 15, y: 5 },
          { playerIndex: 1, x: 19, y: 5 },
        ],
        team2Placements: [{ playerIndex: 0, x: 10, y: 9 }],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 15, y: 5 },
      },
    };

    let scored = false;
    for (let seed = 1; seed <= 60 && !scored; seed++) {
      const game = new HeadlessGame({ scenario: catchScenario, seed });
      const thrower = fixtureValue(game.snapshot().teams[0]).players[0];

      await game.execute({
        type: "declare-action",
        playerId: fixtureValue(thrower).id,
        action: "pass",
      });
      const response = await game.execute({
        type: "pass",
        playerId: fixtureValue(thrower).id,
        x: 19,
        y: 5,
      });
      if (!response.ok) continue;

      const caught = response.events.some(
        (e) =>
          e.name === GameEventNames.UI_Notification &&
          e.data === "Catch Successful!"
      );
      if (!caught) continue;

      scored = true;
      expect(
        response.events.some((e) => e.name === GameEventNames.Touchdown)
      ).toBe(true);
      expect(
        response.snapshot.score[fixtureValue(game.snapshot().teams[0]).id]
      ).toBe(1);
      expect(response.snapshot.phase).toBe(GamePhase.SETUP);
    }
    expect(scored).toBe(true);
  });

  it("resets any player left prone when the drive ends (no lingering prone orientation)", async () => {
    const game = new HeadlessGame({ scenario: tdScenario, seed: 3 });
    const proneVictim = game.ctx.team2.players[0];
    fixtureValue(proneVictim).status = PlayerStatus.PRONE;

    const response = await scoreTouchdown(game);
    expect(response.ok).toBe(true);

    const everyone = response.snapshot.teams.flatMap((t) => t.players);
    expect(everyone.some((p) => p.status === "Prone")).toBe(false);

    expect(
      fixtureValue(
        game.ctx.gameService.getPlayerById(fixtureValue(proneVictim).id)
      ).status
    ).toBe(PlayerStatus.RESERVE);
  });

  it("leaves the ball interactable where it lands after the second-half kickoff", async () => {
    const game = new HeadlessGame({ scenario: tdScenario, seed: 5 });
    const [team1Id, team2Id] = game.snapshot().teams.map((t) => t.id);

    game.ctx.gameService.startGame(fixtureValue(team1Id));
    for (let i = 0; i < 12; i++) await game.execute({ type: "end-turn" });

    let snap = game.snapshot();
    expect(snap.phase).toBe(GamePhase.SETUP);
    expect(snap.turn.isHalf2).toBe(true);

    await placeTeam(game, fixtureValue(snap.activeTeamId));
    await game.execute({
      type: "confirm-setup",
      teamId: fixtureValue(snap.activeTeamId),
    });
    snap = game.snapshot();
    await placeTeam(game, fixtureValue(snap.activeTeamId));
    await game.execute({
      type: "confirm-setup",
      teamId: fixtureValue(snap.activeTeamId),
    });
    snap = game.snapshot();
    expect(snap.phase).toBe(GamePhase.KICKOFF);

    forceDice(game.ctx.rng, [6, 5, 6, 1, 1]);
    const kicker = fixtureValue(
      fixtureValue(snap.teams.find((t) => t.id === team2Id)).players.find(
        (p) => p.position
      )
    );
    const kicked = await game.execute({
      type: "kick-ball",
      playerId: kicker.id,
      x: 10,
      y: 4,
    });
    expect(kicked.ok).toBe(true);

    snap = game.snapshot();
    expect(snap.phase).toBe(GamePhase.PLAY);

    expect(snap.ballPosition).not.toBeNull();
    expect(game.ctx.gameService.isTouchbackPending()).toBe(false);

    const legal = await game.execute({ type: "legal-actions" });
    const movers = fixtureValue(legal.legalActions).players.filter((p) =>
      p.actions.includes("move")
    );
    expect(movers.length).toBeGreaterThan(0);
  });

  it("halftime swaps the kicking team, resets turns, and clears the pitch", async () => {
    const game = new HeadlessGame({ scenario: tdScenario, seed: 5 });
    const [team1Id, team2Id] = game.snapshot().teams.map((t) => t.id);

    game.ctx.gameService.startGame(fixtureValue(team1Id));

    let halftimeResponse;
    for (let i = 0; i < 12; i++) {
      halftimeResponse = await game.execute({ type: "end-turn" });
    }

    const snap = fixtureValue(halftimeResponse).snapshot;
    expect(snap.phase).toBe(GamePhase.SETUP);
    expect(snap.subPhase).toBe(SubPhase.SETUP_KICKING);

    expect(snap.activeTeamId).toBe(team2Id);
    expect(snap.turn.isHalf2).toBe(true);
    expect(
      fixtureValue(halftimeResponse).events.some(
        (e) =>
          e.name === GameEventNames.DriveEnded &&
          z.object({ reason: z.string() }).parse(e.data).reason === "halftime"
      )
    ).toBe(true);

    expect(
      snap.teams.flatMap((t) => t.players).every((p) => p.position === null)
    ).toBe(true);
    expect(snap.ballPosition).toBeNull();
  });
});

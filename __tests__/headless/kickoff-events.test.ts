import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { Scenario } from "../../src/types/Scenario";
import { GameEventNames } from "../../src/types/events";
import {
  INTERACTIVE_KICKOFF_EVENTS,
  KICKOFF_EVENT_MEANING,
  KICKOFF_TABLE,
  KickoffEvent,
} from "../../src/game/kickoff/kickoffEvents";
import {
  effectiveAV,
  effectiveMA,
  getDriveEffects,
} from "../../src/game/kickoff/driveEffects";

const kickoffScenario: Scenario = {
  id: "kickoff-events",
  name: "Kickoff events",
  description: "Seven Open players per team and a team-one kick.",
  setup: {
    team1Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 5,
      y: playerIndex + 2,
    })),
    team2Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 14,
      y: playerIndex + 2,
    })),
    activeTeam: "team2",
    turn: 2,
    phase: GamePhase.KICKOFF,
    subPhase: SubPhase.ROLL_KICKOFF,
  },
};

type KickoffResult = {
  roll: number;
  event: KickoffEvent;
  meaning: string;
  outcome: {
    event: KickoffEvent;
    meaning: string;
    perTeam: Record<string, string[]>;
  };
};

async function kick(seed: number) {
  const game = new HeadlessGame({ scenario: kickoffScenario, seed });
  game.ctx.gameService.seedTurnCounts(2);
  const response = await game.execute({
    type: "kick-ball",
    playerId: game.ctx.team1.players[0].id,
    x: 14,
    y: 5,
  });
  const result = response.events.find(
    (event) => event.name === GameEventNames.KickoffResult
  )?.data as KickoffResult | undefined;
  if (!result) throw new Error(`seed ${seed} produced no kickoff result`);
  return { game, response, result };
}

async function findEveryEvent() {
  const found = new Map<
    KickoffEvent,
    Awaited<ReturnType<typeof kick>>
  >();
  for (let seed = 1; seed <= 800 && found.size < 11; seed++) {
    const run = await kick(seed);
    const needsPending = INTERACTIVE_KICKOFF_EVENTS.has(run.result.event);
    const hasPending = run.response.pendingDecision?.type === "kickoff-event";
    const highKickLandingEmpty =
      run.result.event !== KickoffEvent.HIGH_KICK ||
      (run.response.pendingDecision?.type === "kickoff-event" &&
        !!run.response.pendingDecision.landingSquare &&
        !run.game
          .snapshot()
          .teams.flatMap((team) => team.players)
          .some(
            (player) =>
              player.position?.x ===
                run.response.pendingDecision!.landingSquare!.x &&
              player.position?.y ===
                run.response.pendingDecision!.landingSquare!.y
          ));
    // High Kick can be suppressed by a touchback; retain a seed whose landing
    // square exists so the interactive requirement is actually exercised.
    if (
      !found.has(run.result.event) &&
      (!needsPending || hasPending) &&
      highKickLandingEmpty
    ) {
      found.set(run.result.event, run);
    } else if (hasPending) {
      await run.game.execute({ type: "kickoff-skip" });
    }
  }
  return found;
}

describe("Sevens kickoff events (seeded headless)", () => {
  it("maps every 2D6 total to the eleven Sevens events", () => {
    expect(Object.entries(KICKOFF_TABLE)).toEqual([
      ["2", KickoffEvent.GET_THE_REF],
      ["3", KickoffEvent.TIME_OUT],
      ["4", KickoffEvent.SOLID_DEFENCE],
      ["5", KickoffEvent.HIGH_KICK],
      ["6", KickoffEvent.CHEERING_FANS],
      ["7", KickoffEvent.BRILLIANT_COACHING],
      ["8", KickoffEvent.CHANGING_WEATHER],
      ["9", KickoffEvent.QUICK_SNAP],
      ["10", KickoffEvent.CHARGE],
      ["11", KickoffEvent.DODGY_SNACK],
      ["12", KickoffEvent.PITCH_INVASION],
    ]);
    expect(Object.values(KICKOFF_TABLE)).not.toContain("Blitz!");
    expect(Object.values(KICKOFF_TABLE)).not.toContain("Perfect Defence");
    expect(Object.values(KICKOFF_TABLE)).not.toContain("Throw a Rock");
  });

  it("reproduces and applies every result through the headless protocol", async () => {
    const found = await findEveryEvent();
    expect([...found.keys()].sort()).toHaveLength(11);

    for (const [event, run] of found) {
      expect(run.result.meaning).toBe(KICKOFF_EVENT_MEANING[event]);
      expect(run.result.outcome.event).toBe(event);
      expect(Object.keys(run.result.outcome.perTeam).length).toBeGreaterThan(0);
    }

    const getRef = found.get(KickoffEvent.GET_THE_REF)!;
    expect(getRef.game.snapshot().bribes).toEqual({ team1: 1, team2: 1 });

    const timeout = found.get(KickoffEvent.TIME_OUT)!;
    expect(timeout.game.ctx.gameService.getTurnNumber("team1")).toBe(3);
    // The receiving side immediately begins its turn after the event.
    expect(timeout.game.ctx.gameService.getTurnNumber("team2")).toBe(4);

    const cheering = found.get(KickoffEvent.CHEERING_FANS)!;
    expect(
      Object.keys(cheering.game.snapshot().driveEffects?.owedAssists ?? {})
        .length
    ).toBeGreaterThan(0);
    const cheeringLogs = cheering.response.events
      .filter(
        (eventRecord) =>
          eventRecord.name === GameEventNames.UI_GameLog &&
          String(eventRecord.data).includes("Cheering Fans")
      )
      .map((eventRecord) => String(eventRecord.data));
    expect(
      cheeringLogs.some((line) =>
        line.includes(cheering.game.ctx.team1.name)
      )
    ).toBe(true);
    expect(
      cheeringLogs.some((line) =>
        line.includes(cheering.game.ctx.team2.name)
      )
    ).toBe(true);
    expect(cheeringLogs.every((line) => line.includes("D6"))).toBe(true);

    const coaching = found.get(KickoffEvent.BRILLIANT_COACHING)!;
    expect(
      Object.values(
        coaching.game.snapshot().driveEffects?.freeRerolls ?? {}
      ).reduce((sum, count) => sum + count, 0)
    ).toBeGreaterThan(0);

    const weather = found.get(KickoffEvent.CHANGING_WEATHER)!;
    expect(
      weather.response.events.some(
        (eventRecord) => eventRecord.name === GameEventNames.WeatherChanged
      )
    ).toBe(true);

    const snack = found.get(KickoffEvent.DODGY_SNACK)!;
    const snackModifiers =
      snack.game.snapshot().driveEffects?.playerModifiers ?? {};
    expect(Object.keys(snackModifiers).length).toBeGreaterThan(0);
    for (const [playerId, modifier] of Object.entries(snackModifiers)) {
      const player = [...snack.game.ctx.team1.players, ...snack.game.ctx.team2.players]
        .find((candidate) => candidate.id === playerId)!;
      if (modifier.confinedToReserves) {
        expect(player.gridPosition).toBeUndefined();
        expect(player.status).toBe("Reserve");
      } else {
        expect(effectiveMA(player, snack.game.ctx.gameService.getState())).toBe(
          player.stats.MA - 1
        );
        expect(effectiveAV(player, snack.game.ctx.gameService.getState())).toBe(
          player.stats.AV - 1
        );
      }
    }

    const invasion = found.get(KickoffEvent.PITCH_INVASION)!;
    expect(
      invasion.game
        .snapshot()
        .teams.flatMap((team) => team.players)
        .some((player) => player.status === "Stunned")
    ).toBe(true);

    for (const event of INTERACTIVE_KICKOFF_EVENTS) {
      expect(found.get(event)?.response.pendingDecision).toMatchObject({
        type: "kickoff-event",
        event,
      });
    }

    const quick = found.get(KickoffEvent.QUICK_SNAP)!;
    expect(
      quick.response.events.some(
        (eventRecord) => eventRecord.name === GameEventNames.BallKicked
      )
    ).toBe(true);
    expect(
      quick.response.events.some(
        (eventRecord) =>
          eventRecord.name === GameEventNames.KickoffBallLanding
      )
    ).toBe(false);
    const quickSkipped = await quick.game.execute({ type: "kickoff-skip" });
    expect(
      quickSkipped.events.some(
        (eventRecord) =>
          eventRecord.name === GameEventNames.KickoffBallLanding
      )
    ).toBe(true);
    const quickLanding = quickSkipped.events.findIndex(
      (eventRecord) =>
        eventRecord.name === GameEventNames.KickoffBallLanding
    );
    const quickComplete = quickSkipped.events.findIndex(
      (eventRecord) =>
        eventRecord.name === GameEventNames.KickoffSequenceCompleted
    );
    const quickReady = quickSkipped.events.findIndex(
      (eventRecord) => eventRecord.name === GameEventNames.ReadyToStart
    );
    expect(quickLanding).toBeGreaterThanOrEqual(0);
    expect(quickComplete).toBeGreaterThan(quickLanding);
    expect(quickReady).toBeGreaterThan(quickComplete);

    const high = found.get(KickoffEvent.HIGH_KICK)!;
    const highBall = high.response.events.findIndex(
      (eventRecord) => eventRecord.name === GameEventNames.BallKicked
    );
    const highStep = high.response.events.findIndex(
      (eventRecord) =>
        eventRecord.name === GameEventNames.KickoffEventStepStarted
    );
    expect(highBall).toBeGreaterThanOrEqual(0);
    expect(highStep).toBeGreaterThan(highBall);

    for (const run of found.values()) {
      if (run.game.pendingDecision()?.type === "kickoff-event") {
        await run.game.execute({ type: "kickoff-skip" });
      }
    }
  });

  it("clears unused drive effects and restores effective MA/AV", () => {
    const game = new HeadlessGame({ scenario: kickoffScenario, seed: 1 });
    const player = game.ctx.team1.players[0];
    const baseMA = player.stats.MA;
    const baseAV = player.stats.AV;
    const effects = getDriveEffects(game.ctx.gameService.getState());
    effects.freeRerolls.team1 = 1;
    effects.owedAssists.team1 = { turn: 3, used: false };
    effects.playerModifiers[player.id] = {
      maModifier: -1,
      avModifier: -1,
    };
    effects.freeRerolls.team2 = 1;
    game.ctx.team2.rerolls = 0;
    expect(game.ctx.gameService.getRerollArbiter().teamRerollAvailable("team2")).toBe(
      true
    );
    game.ctx.gameService.getRerollArbiter().consumeTeamReroll("team2");
    expect(effects.freeRerolls.team2).toBeUndefined();
    expect(game.ctx.team2.rerolls).toBe(0);

    game.ctx.gameService.seedTurnCounts(2);
    effects.owedAssists.team2 = { turn: 2, used: false };
    game.ctx.gameService.endTurn();
    expect(effects.owedAssists.team2).toBeUndefined();

    expect(effectiveMA(player, game.ctx.gameService.getState())).toBe(
      baseMA - 1
    );
    expect(effectiveAV(player, game.ctx.gameService.getState())).toBe(
      baseAV - 1
    );

    game.ctx.gameService.resetDriveState();

    expect(game.snapshot().driveEffects).toEqual({
      freeRerolls: {},
      owedAssists: {},
      playerModifiers: {},
    });
    expect(effectiveMA(player, game.ctx.gameService.getState())).toBe(baseMA);
    expect(effectiveAV(player, game.ctx.gameService.getState())).toBe(baseAV);
  });

  it("redeploys Solid Defence directly on-pitch and resolves High Kick before landing", async () => {
    const found = await findEveryEvent();

    const solid = found.get(KickoffEvent.SOLID_DEFENCE)!;
    const solidPlayer = solid.game.ctx.team1.players[0];
    const original = { ...solidPlayer.gridPosition! };
    const occupied = new Set(
      [...solid.game.ctx.team1.players, ...solid.game.ctx.team2.players]
        .filter((player) => player.gridPosition)
        .map(
          (player) =>
            `${player.gridPosition!.x},${player.gridPosition!.y}`
        )
    );
    let destination: { x: number; y: number } | undefined;
    for (let x = 0; x <= 6 && !destination; x += 1) {
      for (let y = 0; y < 11; y += 1) {
        if (!occupied.has(`${x},${y}`)) {
          destination = { x, y };
          break;
        }
      }
    }
    expect(destination).toBeDefined();

    const invalidDrop = await solid.game.execute({
      type: "kickoff-place-player",
      playerId: solidPlayer.id,
      x: 7,
      y: original.y,
    });
    expect(invalidDrop.ok).toBe(false);
    expect(solidPlayer.gridPosition).toEqual(original);
    expect(solid.game.pendingDecision()).toMatchObject({
      selectedPlayerIds: [],
      movedPlayerIds: [],
    });

    const redeployed = await solid.game.execute({
      type: "kickoff-place-player",
      playerId: solidPlayer.id,
      x: destination!.x,
      y: destination!.y,
    });
    expect(redeployed.ok).toBe(true);
    expect(redeployed.pendingDecision).toMatchObject({
      selectedPlayerIds: [solidPlayer.id],
      movedPlayerIds: [solidPlayer.id],
      awaitingPlacement: [],
    });
    expect(solidPlayer.gridPosition).toEqual(destination);
    expect(solidPlayer.gridPosition).not.toEqual(original);

    const confirmed = await solid.game.execute({ type: "kickoff-confirm" });
    expect(confirmed.pendingDecision?.type).not.toBe("kickoff-event");
    expect(solidPlayer.gridPosition).toEqual(destination);

    const high = found.get(KickoffEvent.HIGH_KICK)!;
    const highPending = high.game.pendingDecision();
    expect(highPending?.type).toBe("kickoff-event");
    if (highPending?.type !== "kickoff-event") return;
    const landing = highPending.landingSquare!;
    const receiver = high.game.ctx.team2.players.find(
      (player) =>
        player.gridPosition &&
        (player.gridPosition.x !== landing.x ||
          player.gridPosition.y !== landing.y)
    )!;
    expect(
      (
        await high.game.execute({
          type: "kickoff-select-player",
          playerId: receiver.id,
        })
      ).ok
    ).toBe(true);
    const placed = await high.game.execute({
      type: "kickoff-place-player",
      playerId: receiver.id,
      x: landing.x,
      y: landing.y,
    });
    // A landing square already occupied by a different player cannot accept
    // High Kick; the seed finder ordinarily supplies an empty square.
    expect(placed.ok).toBe(true);
    expect(receiver.gridPosition).toEqual(landing);
  });

  it("spends Charge action budgets without consuming coming-turn activations", async () => {
    const found = await findEveryEvent();
    const { game } = found.get(KickoffEvent.CHARGE)!;
    const players = game.ctx.team1.players.slice(0, 2);
    for (const player of players) {
      await game.execute({
        type: "kickoff-select-player",
        playerId: player.id,
      });
    }
    await game.execute({ type: "kickoff-confirm" });

    expect(
      (
        await game.execute({
          type: "declare-action",
          playerId: players[0].id,
          action: "blitz",
        })
      ).ok
    ).toBe(true);
    expect(game.pendingDecision()).toMatchObject({
      type: "kickoff-event",
      charge: { budget: { blitz: 0 } },
    });
    await game.execute({
      type: "end-activation",
      playerId: players[0].id,
    });
    expect(game.pendingDecision()).toMatchObject({
      type: "kickoff-event",
      charge: { activePlayerId: players[1].id },
    });
    await game.execute({
      type: "declare-action",
      playerId: players[1].id,
      action: "move",
    });
    await game.execute({
      type: "end-activation",
      playerId: players[1].id,
    });

    expect(game.ctx.gameService.getKickoffEventStep()).toBeNull();
    expect(game.ctx.gameService.hasPlayerActed(players[0].id)).toBe(false);
    expect(game.ctx.gameService.hasPlayerActed(players[1].id)).toBe(false);
  });

  it("aborts Charge immediately when the active player is knocked down", async () => {
    const found = await findEveryEvent();
    const { game } = found.get(KickoffEvent.CHARGE)!;
    const pending = game.pendingDecision();
    expect(pending?.type).toBe("kickoff-event");
    if (pending?.type !== "kickoff-event") return;

    const candidates = game.ctx.team1.players.slice(0, 2);
    for (const player of candidates) {
      expect(
        (
          await game.execute({
            type: "kickoff-select-player",
            playerId: player.id,
          })
        ).ok
      ).toBe(true);
    }
    expect((await game.execute({ type: "kickoff-confirm" })).ok).toBe(true);

    const active = game.pendingDecision();
    expect(active?.type).toBe("kickoff-event");
    if (active?.type !== "kickoff-event") return;
    const activeId = active.charge?.activePlayerId;
    expect(activeId).toBe(candidates[0].id);

    game.ctx.eventBus.emit(GameEventNames.PlayerKnockedDown, {
      playerId: activeId!,
    });
    await Promise.resolve();

    expect(game.ctx.gameService.getKickoffEventStep()).toBeNull();
    expect(game.ctx.gameService.hasPlayerActed(candidates[0].id)).toBe(false);
    expect(game.ctx.gameService.hasPlayerActed(candidates[1].id)).toBe(false);
  });
});

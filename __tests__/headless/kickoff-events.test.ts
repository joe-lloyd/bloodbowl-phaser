import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase } from "../../src/types/GameState";
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
import { SkillType, getSkill } from "../../src/types/Skills";
import { kickoffScenario, kick, findEveryEvent } from "./kickoffKicks";

describe("Sevens kickoff events (seeded headless)", () => {
  it("maps every 2D6 total to the eleven Sevens events", () => {
    expect(Object.entries(KICKOFF_TABLE)).toEqual([
      ["2", KickoffEvent.GET_THE_REF],
      ["3", KickoffEvent.TIME_OUT],
      ["4", KickoffEvent.ALERT_DEFENCE],
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

  it("announces each passive result with its effect and who it favours", async () => {
    const found = await findEveryEvent();
    const banners = new Map(
      [...found].map(([event, run]) => [
        event,
        run.response.events
          .map((e) => e.data)
          .filter(
            (data) =>
              typeof data === "object" &&
              data !== null &&
              "kind" in data &&
              data.kind === "kickoff-result"
          ),
      ])
    );

    expect(banners.get(KickoffEvent.GET_THE_REF)).toEqual([
      {
        kind: "kickoff-result",
        headline: KickoffEvent.GET_THE_REF,
        subtitle: "Both teams gain a Bribe. Favours both teams.",
      },
    ]);
    expect(banners.get(KickoffEvent.TIME_OUT)).toEqual([
      {
        kind: "kickoff-result",
        headline: KickoffEvent.TIME_OUT,
        subtitle: "Both turn markers move by one. Favours neither team.",
      },
    ]);
    // An interactive event is named first, with the D3 that comes next;
    // its step's overlay presents the rest.
    expect(banners.get(KickoffEvent.CHARGE)).toEqual([
      {
        kind: "kickoff-result",
        headline: KickoffEvent.CHARGE,
        subtitle: expect.stringMatching(/^Next, a D3: .* Favours /),
      },
    ]);
    for (const event of INTERACTIVE_KICKOFF_EVENTS) {
      expect(banners.get(event)).toHaveLength(1);
    }
  });

  it("names a rolled-off event first, then what its dice decided", async () => {
    const found = await findEveryEvent();
    const run = found.get(KickoffEvent.DODGY_SNACK)!;
    const names = run.response.events
      .filter((e) =>
        ["ui:announce", "diceRoll"].includes(e.name)
      )
      .map((e) =>
        e.name === "diceRoll"
          ? `roll: ${(e.data as { rollType: string }).rollType}`
          : `banner: ${(e.data as { subtitle: string }).subtitle}`
      );
    const reveal = names.indexOf(
      "banner: Next, each team rolls a D6. The lower roll has a random player eat something bad."
    );
    const rollOff = names.findIndex((n) =>
      n.startsWith("roll: Dodgy Snack: D6 for ")
    );
    const decided = names.findIndex(
      (n, i) => i > reveal && n.startsWith("banner: ") && n !== names[reveal]
    );

    expect(reveal).toBeGreaterThan(names.indexOf("roll: Kickoff Event"));
    expect(names.indexOf("roll: Kickoff Event")).toBeGreaterThan(-1);
    expect(rollOff).toBeGreaterThan(reveal);
    expect(names[rollOff]).toMatch(/, lower roll eats the snack$/);
    expect(decided).toBeGreaterThan(rollOff);
    expect(names[decided]).toMatch(/for the drive|Nobody on the pitch/);
  });

  it("resolves High Kick before landing", async () => {
    const found = await findEveryEvent();

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

  it("lets the charger up now act, whatever turn the stale ledger holds (regression: Charge! click-to-move)", async () => {
    const found = await findEveryEvent();
    const { game } = found.get(KickoffEvent.CHARGE)!;
    const gs = game.ctx.gameService;
    const [charger, waiting] = game.ctx.team1.players.slice(1, 3);
    const receiver = game.ctx.team2.players[1];
    // The ledger still holds the turn before the kick-off: here the kicking
    // team's scoring turn, with the charger already spent in it
    const turn = gs.getState().turn;
    turn.teamId = game.ctx.team1.id;
    turn.activatedPlayerIds.add(charger.id);
    turn.movementUsed.set(charger.id, charger.stats.MA);

    await game.execute({ type: "kickoff-select-player", playerId: charger.id });
    await game.execute({ type: "kickoff-confirm" });

    expect(gs.canActivate(charger.id)).toBe(true);
    expect(gs.hasPlayerActed(charger.id)).toBe(false);
    expect(gs.getMovementUsed(charger.id)).toBe(0);
    expect(gs.canActivate(waiting.id)).toBe(false);
    expect(gs.canActivate(receiver.id)).toBe(false);

    await game.execute({
      type: "declare-action",
      playerId: charger.id,
      action: "move",
    });
    const from = charger.gridPosition!;
    const path = [1, 2, 3].map((dx) => ({ x: from.x + dx, y: from.y }));
    const moved = await game.execute({ type: "move", playerId: charger.id, path });
    expect(moved.ok).toBe(true);
    expect(gs.getPlayerById(charger.id)!.gridPosition).toEqual(path[2]);
    await game.execute({ type: "end-activation", playerId: charger.id });

    // The drive starts on a fresh receiving turn
    expect(gs.getKickoffEventStep()).toBeNull();
    expect(gs.getPhase()).toBe(GamePhase.PLAY);
    expect(gs.getState().turn.teamId).toBe(game.ctx.team2.id);
    expect(gs.canActivate(receiver.id)).toBe(true);
    expect(gs.canActivate(charger.id)).toBe(false);
  });

  it("getKickoffEventStep() returns a fresh reference after each mutation (regression: frozen x/x counter)", async () => {
    const found = await findEveryEvent();
    const { game } = found.get(KickoffEvent.QUICK_SNAP)!;
    const beforeSelect = game.ctx.gameService.getKickoffEventStep();
    expect(beforeSelect?.selectedPlayerIds).toEqual([]);
    // Quick Snap belongs to the receiving coach — select one of their Open
    // players, not the kicking team's.
    const owningTeam =
      beforeSelect!.teamId === game.ctx.team1.id
        ? game.ctx.team1
        : game.ctx.team2;
    const player = owningTeam.players.find(
      (candidate) =>
        candidate.gridPosition &&
        candidate.gridPosition.x > 0 &&
        candidate.gridPosition.x < 20
    )!;

    const selectResponse = await game.execute({
      type: "kickoff-select-player",
      playerId: player.id,
    });
    expect(selectResponse.ok).toBe(true);
    const afterSelect = game.ctx.gameService.getKickoffEventStep();
    // A fresh object every call — not the same reference as before the
    // mutation, and not the same reference between two calls in a row.
    expect(afterSelect).not.toBe(beforeSelect);
    expect(afterSelect).not.toBe(game.ctx.gameService.getKickoffEventStep());
    expect(afterSelect?.selectedPlayerIds).toEqual([player.id]);
    // The two snapshots' array fields must be independent copies, not the
    // same mutable array leaking out to every caller.
    expect(afterSelect?.selectedPlayerIds).not.toBe(beforeSelect?.selectedPlayerIds);

    const toX = player.gridPosition!.x === 0 ? 1 : player.gridPosition!.x - 1;
    const moveResponse = await game.execute({
      type: "kickoff-move-player",
      playerId: player.id,
      x: toX,
      y: player.gridPosition!.y,
    });
    expect(moveResponse.ok).toBe(true);
    const afterMove = game.ctx.gameService.getKickoffEventStep();
    expect(afterMove).not.toBe(afterSelect);
    expect(afterMove?.movedPlayerIds).toEqual([player.id]);

    await game.execute({ type: "kickoff-skip" });
  });

  it("Charge!'s active player and step reference advance correctly across advanceCharge() (regression: frozen active player)", async () => {
    const found = await findEveryEvent();
    const { game } = found.get(KickoffEvent.CHARGE)!;
    const players = game.ctx.team1.players.slice(0, 2);
    for (const player of players) {
      await game.execute({
        type: "kickoff-select-player",
        playerId: player.id,
      });
    }

    const beforeConfirm = game.ctx.gameService.getKickoffEventStep();
    await game.execute({ type: "kickoff-confirm" });
    const afterConfirm = game.ctx.gameService.getKickoffEventStep();
    expect(afterConfirm).not.toBe(beforeConfirm);
    expect(afterConfirm?.charge?.activePlayerId).toBe(players[0].id);

    await game.execute({
      type: "declare-action",
      playerId: players[0].id,
      action: "move",
    });
    await game.execute({
      type: "end-activation",
      playerId: players[0].id,
    });
    const afterFirstAdvance = game.ctx.gameService.getKickoffEventStep();
    // The step reference must change and the active player must move on to
    // the second queued player — never stay frozen on the first.
    expect(afterFirstAdvance).not.toBe(afterConfirm);
    expect(afterFirstAdvance?.charge?.activePlayerId).toBe(players[1].id);
    expect(afterFirstAdvance?.charge?.activePlayerId).not.toBe(
      afterConfirm?.charge?.activePlayerId
    );

    await game.execute({
      type: "declare-action",
      playerId: players[1].id,
      action: "move",
    });
    await game.execute({
      type: "end-activation",
      playerId: players[1].id,
    });
    // Queue exhausted: the step closes.
    expect(game.ctx.gameService.getKickoffEventStep()).toBeNull();
  });

  it("lets a Frenzy player finish a Charge Blitz: follow-up, then the second Block", async () => {
    for (let seed = 1; seed < 400; seed++) {
      const { game, result } = await kick(seed);
      if (result.event !== KickoffEvent.CHARGE) continue;
      const attacker = game.ctx.team1.players[0];
      const defender = game.ctx.team2.players[0];
      attacker.skills = [...attacker.skills, getSkill(SkillType.FRENZY)];
      await game.execute({
        type: "kickoff-select-player",
        playerId: attacker.id,
      });
      await game.execute({ type: "kickoff-confirm" });
      // Charge! takes an Open player, so the target comes alongside after.
      attacker.gridPosition = { x: 9, y: 5 };
      defender.gridPosition = { x: 10, y: 5 };
      await game.execute({
        type: "declare-action",
        playerId: attacker.id,
        action: "blitz",
      });
      const rolled = await game.execute({
        type: "block",
        attackerId: attacker.id,
        defenderId: defender.id,
      });
      if (rolled.pendingDecision?.type !== "block-dice") continue;
      const push = rolled.pendingDecision.options.findIndex(
        (o) => o.type === "push"
      );
      if (push < 0) continue;
      await game.execute({ type: "choose-block-result", index: push });
      const pushed = await game.execute({
        type: "choose-push-direction",
        x: 11,
        y: 5,
      });
      expect(game.snapshot().phase).toBe(GamePhase.KICKOFF);
      expect(attacker.gridPosition).toEqual({ x: 10, y: 5 });
      expect(pushed.pendingDecision?.type).toBe("block-dice");
      return;
    }
    throw new Error("no seed rolled Charge! and a Push");
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

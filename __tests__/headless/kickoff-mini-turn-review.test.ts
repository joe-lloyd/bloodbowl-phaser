import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { matchSaveSchema } from "../../src/boundary/schemas/MatchSave";
import { checkOwnership, gateContextOf } from "../../src/network/OwnershipGate";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { MatchAutosave } from "../../src/game/persistence/MatchAutosave";
import { GameEventNames } from "../../src/types/events";
import { SkillType, getSkill } from "../../src/types/Skills";
import type { Scenario } from "../../src/types/Scenario";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { forceDice } from "../utils/test-helpers";
import { kick, kickoffScenario } from "./kickoffKicks";
import { choose, rehearse, settle } from "./kickoffRehearsal";

const paced = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 15);
  });

async function kickedCharge() {
  for (let seed = 1; seed < 400; seed++) {
    if ((await kick(seed)).result.event !== KickoffEvent.CHARGE) continue;
    const game = new HeadlessGame({ scenario: kickoffScenario, seed, delay: paced });
    await game.execute({
      type: "kick-ball",
      playerId: fixtureValue(game.ctx.team1.players[0]).id,
      x: 14,
      y: 5,
    });
    return game;
  }
  throw new Error("no seed rolls Charge!");
}

describe("a kick during a kick-off turn", () => {
  it("is refused to the coach who is not acting, and the turn carries on", async () => {
    for (const event of [KickoffEvent.CHARGE, KickoffEvent.QUICK_SNAP]) {
      const { game, gs, home, away } = await rehearse(event, { players: 1 });
      const [actor, other] =
        event === KickoffEvent.CHARGE ? [home(1), away(1)] : [away(1), home(1)];
      await choose(game, [actor.id]);
      for (const type of ["kick-ball", "select-kicker"] as const) {
        const command = { type, playerId: other.id, x: 14, y: 5 };
        expect(
          checkOwnership(command, other.teamId, gateContextOf(game, "team1"))
        ).toEqual({ allowed: false, reason: "not-your-turn" });
      }
      const kicked = await game.execute({
        type: "kick-ball",
        playerId: other.id,
        x: 5,
        y: 5,
      });
      expect(kicked.ok).toBe(false);
      expect(gs.canActivate(actor.id)).toBe(true);
    }
  });
});

describe("Change picks with a real kick in the air", () => {
  it("still answers the turn's end once the ball has landed", async () => {
    const game = await kickedCharge();
    const player = fixtureValue(game.ctx.team1.players[1]);
    await choose(game, [player.id]);
    await game.execute({ type: "kickoff-reselect" });
    await settle();
    expect(game.isSuspended()).toBe(true);
    await game.execute({ type: "kickoff-confirm" });
    await settle();
    const ended = await game.execute({ type: "end-turn" });
    expect(ended.ok).toBe(true);
    expect(ended.snapshot.phase).toBe(GamePhase.PLAY);
    expect(game.isSuspended()).toBe(false);
  });

  it("stays suspended through a Block's own choices", async () => {
    const game = await kickedCharge();
    const attacker = fixtureValue(game.ctx.team1.players[1]);
    const defender = fixtureValue(game.ctx.team2.players[1]);
    await choose(game, [attacker.id]);
    await blitzPush(game, attacker.id, defender.id);
    expect(game.isSuspended()).toBe(true);
    const ended = await game.execute({ type: "end-turn" });
    expect(ended.snapshot.phase).toBe(GamePhase.PLAY);
  });
});

async function resumedCharge(options: { picks?: number } = {}) {
  const game = await kickedCharge();
  const picks = game.ctx.team1.players.slice(1, 1 + (options.picks ?? 1));
  await choose(game, picks.map(({ id }) => id));
  const save = matchSaveSchema.parse(structuredClone(game.matchSave()));
  const resumed = new HeadlessGame({ matchSave: save, delay: paced });
  const landings: unknown[] = [];
  resumed.ctx.eventBus.on(GameEventNames.KickoffBallLanding, (landing) =>
    landings.push(landing)
  );
  return { game: resumed, landings, ids: picks.map(({ id }) => id) };
}

const anotherKick = (game: HeadlessGame) =>
  game.execute({
    type: "kick-ball",
    playerId: fixtureValue(game.ctx.team1.players[0]).id,
    x: 14,
    y: 5,
  });

function expectOneLanding(game: HeadlessGame, landings: unknown[]) {
  expect(landings).toHaveLength(1);
  expect(game.isSuspended()).toBe(false);
  expect(game.snapshot()).toMatchObject({
    phase: GamePhase.PLAY,
    turn: { teamId: "team2", turnNumber: 1 },
  });
}

describe("a kick resumed from a save", () => {
  it("answers the end of the Charge once the ball has landed", async () => {
    const { game, landings } = await resumedCharge();
    const ended = await game.execute({ type: "end-turn" });
    expect(ended.ok).toBe(true);
    expectOneLanding(game, landings);
    expect((await anotherKick(game)).ok).toBe(false);
    await settle();
    expectOneLanding(game, landings);
  });

  it("refuses a kick while the resumed one is landing", async () => {
    const { game, landings } = await resumedCharge();
    const ending = game.execute({ type: "end-turn" });
    await settle();
    expect(game.isSuspended()).toBe(true);
    expect(game.snapshot().phase).toBe(GamePhase.KICKOFF);
    expect(
      checkOwnership(
        { type: "kick-ball", playerId: "team1-player-1", x: 14, y: 5 },
        "team1",
        gateContextOf(game, "team1")
      ).allowed
    ).toBe(false);
    expect((await anotherKick(game)).ok).toBe(false);
    await game.ctx.gameService.kickBall({
      isTeam1Kicking: true,
      playerId: "team1-player-1",
      targetX: 14,
      targetY: 5,
    });
    await ending;
    expectOneLanding(game, landings);
  });

  it("lands once after Change picks and a skip", async () => {
    const { game, landings } = await resumedCharge();
    await game.execute({ type: "kickoff-reselect" });
    await settle();
    expect(game.pendingDecision()?.type).toBe("kickoff-event");
    expect((await game.execute({ type: "kickoff-skip" })).ok).toBe(true);
    expectOneLanding(game, landings);
  });

  it("lands once when the last player finishes", async () => {
    const { game, landings, ids } = await resumedCharge();
    await game.execute({ type: "end-activation", playerId: fixtureValue(ids[0]) });
    await vi.waitFor(() => {
      expectOneLanding(game, landings);
    });
  });

  it("lands once after a turnover", async () => {
    const { game, landings, ids } = await resumedCharge({ picks: 2 });
    game.ctx.team1.rerolls = 0;
    const faller = fixtureValue(game.ctx.gameService.getPlayerById(fixtureValue(ids[0])));
    faller.gridPosition = { x: 9, y: 5 };
    fixtureValue(game.ctx.team2.players[1]).gridPosition = { x: 10, y: 5 };
    await game.execute({ type: "declare-action", playerId: faller.id, action: "move" });
    forceDice(game.ctx.rng, [1, 1, 1]);
    await game.execute({ type: "move", playerId: faller.id, path: [{ x: 8, y: 5 }] });
    await vi.waitFor(() => {
      expectOneLanding(game, landings);
    });
  });

  it("is dropped with the rest of the old state on a resync", async () => {
    const { game } = await resumedCharge();
    const ending = game.execute({ type: "end-turn" });
    void ending;
    delete game.ctx.gameService.getState().kick;
    game.adoptPending(null);
    expect(game.isSuspended()).toBe(false);
  });
});

describe("a reconnect while a resumed Charge is choosing again", () => {
  it("gives the rejoining engine the same choice", async () => {
    const { game, ids } = await resumedCharge();
    await game.execute({ type: "kickoff-reselect" });
    await settle();
    const save = matchSaveSchema.parse(structuredClone(game.matchSave()));
    const rejoined = new HeadlessGame({ matchSave: save, delay: paced });
    rejoined.adoptPending(game.pendingDecision());
    expect((await rejoined.execute({ type: "kickoff-confirm" })).ok).toBe(true);
    expect(rejoined.ctx.gameService.canActivate(fixtureValue(ids[0]))).toBe(true);
    const ended = await rejoined.execute({ type: "end-turn" });
    expect(ended.snapshot.phase).toBe(GamePhase.PLAY);
  });
});

describe("an autosave around a kick", () => {
  const saved = (game: HeadlessGame) => {
    const writes: unknown[] = [];
    const autosave = new MatchAutosave(
      game.ctx.eventBus,
      game.ctx.gameService,
      () => game.matchSave(),
      {
        repository: {
          read: () => null,
          write: (save) => writes.push(save),
          clear: () => undefined,
          describe: () => null,
        },
        debounceMs: 60_000,
      }
    );
    return autosave.flushNow().then((wrote) => {
      autosave.dispose();
      return { wrote, writes: writes.length };
    });
  };

  it("waits while the ball lands, and saves the choosing and the turn", async () => {
    const game = await kickedCharge();
    expect(await saved(game)).toEqual({ wrote: true, writes: 1 });
    await choose(game, [fixtureValue(game.ctx.team1.players[1]).id]);
    expect(await saved(game)).toEqual({ wrote: true, writes: 1 });
    const ending = game.execute({ type: "end-turn" });
    expect(await saved(game)).toEqual({ wrote: false, writes: 0 });
    await ending;
    expect(await saved(game)).toEqual({ wrote: true, writes: 1 });
  });
});

describe("a Punt in a save", () => {
  it("stays spent for the turn", async () => {
    const game = new HeadlessGame({ scenario: { ...PLAY, setup: { ...PLAY.setup, ballPosition: { x: 5, y: 1 } } }, seed: 1 });
    const punters = game.ctx.team1.players.slice(1, 3);
    for (const punter of punters)
      punter.skills = [...punter.skills, getSkill(SkillType.PUNT)];
    const [first, second] = punters.map(({ id }) => id);
    await game.execute({ type: "declare-action", playerId: fixtureValue(first), action: "punt" });
    await game.execute({ type: "punt", playerId: fixtureValue(first), x: 1, y: 0 });
    await settle();
    expect(game.snapshot().turn.hasPunted).toBe(true);
    await game.execute({ type: "end-activation", playerId: fixtureValue(first) });
    const save = matchSaveSchema.parse(structuredClone(game.matchSave()));
    const resumed = new HeadlessGame({ matchSave: save });
    expect(resumed.snapshot()).toMatchObject({ activeTeamId: "team1", activePlayer: null });
    const again = await resumed.execute({ type: "declare-action", playerId: fixtureValue(second), action: "punt" });
    expect(again.ok).toBe(false);
  });
});

async function blitzPush(game: HeadlessGame, attackerId: string, defenderId: string) {
  const gs = game.ctx.gameService;
  fixtureValue(gs.getPlayerById(attackerId)).gridPosition = { x: 9, y: 5 };
  fixtureValue(gs.getPlayerById(defenderId)).gridPosition = { x: 10, y: 5 };
  await game.execute({ type: "declare-action", playerId: attackerId, action: "blitz" });
  forceDice(game.ctx.rng, [3, 3, 3]);
  const block = await game.execute({ type: "block", attackerId, defenderId });
  const pending = block.pendingDecision;
  const push =
    pending?.type === "block-dice"
      ? pending.options.findIndex(({ type }) => type === "push")
      : -1;
  expect(push).toBeGreaterThanOrEqual(0);
  await game.execute({ type: "choose-block-result", index: push });
  await settle();
  const direction = game.pendingDecision();
  if (direction?.type === "push-direction") {
    const square = fixtureValue(direction.options[0]);
    await game.execute({ type: "choose-push-direction", x: square.x, y: square.y });
    await settle();
  }
  if (game.pendingDecision()?.type === "follow-up")
    await game.execute({ type: "choose-follow-up", followUp: false });
  await settle();
}

async function blockAgainAfterReload(game: HeadlessGame, attackerId: string, defenderId: string) {
  const save = matchSaveSchema.parse(structuredClone(game.matchSave()));
  const resumed = new HeadlessGame({ matchSave: save });
  const gs = resumed.ctx.gameService;
  expect(gs.getState().activePlayer).toMatchObject({ id: attackerId, action: "blitz" });
  fixtureValue(gs.getPlayerById(defenderId)).gridPosition = { x: 10, y: 5 };
  fixtureValue(gs.getPlayerById(attackerId)).gridPosition = { x: 9, y: 5 };
  const second = await resumed.execute({ type: "block", attackerId, defenderId });
  await settle();
  return { second, spent: gs.hasUsedBlitzBlock(attackerId) };
}

const PLAY: Scenario = {
  id: "blitz-save",
  name: "Blitz save",
  description: "",
  setup: {
    team1Placements: [1, 2, 3].map((playerIndex) => ({ playerIndex, x: 5, y: playerIndex })),
    team2Placements: [1, 2, 3].map((playerIndex) => ({ playerIndex, x: 15, y: playerIndex })),
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
  },
};

describe("a save taken after a Blitz's Block", () => {
  it.each(["a Charge", "a normal turn"])("has no second Block in %s", async (where) => {
    const game =
      where === "a Charge"
        ? (await rehearse(KickoffEvent.CHARGE, { players: 2 })).game
        : new HeadlessGame({ scenario: PLAY, seed: 1 });
    const attackerId = fixtureValue(game.ctx.team1.players[1]).id;
    const defenderId = fixtureValue(game.ctx.team2.players[1]).id;
    if (where === "a Charge")
      await choose(game, [attackerId, fixtureValue(game.ctx.team1.players[2]).id]);
    await blitzPush(game, attackerId, defenderId);
    expect(game.ctx.gameService.hasUsedBlitzBlock(attackerId)).toBe(true);

    const { second, spent } = await blockAgainAfterReload(game, attackerId, defenderId);
    expect(second.pendingDecision).toBeNull();
    expect(spent).toBe(true);
  });
});

describe("Quick Attack", () => {
  it("allows no Jump and no Move after the Block is declared", async () => {
    const { game, home, away } = await rehearse(KickoffEvent.QUICK_ATTACK);
    const player = home(1);
    player.skills = [...player.skills, getSkill(SkillType.LEAP)];
    player.gridPosition = { x: 9, y: 5 };
    away(1).gridPosition = { x: 10, y: 5 };
    await choose(game, [player.id]);
    const block = await game.execute({
      type: "declare-action",
      playerId: player.id,
      action: "block",
    });
    expect(block.ok).toBe(true);
    const jumped = await game.execute({ type: "jump", playerId: player.id, x: 11, y: 5 });
    expect(jumped.ok).toBe(false);
    const moved = await game.execute({
      type: "move",
      playerId: player.id,
      path: [{ x: 8, y: 5 }],
    });
    expect(moved.ok).toBe(false);
    expect(player.gridPosition).toEqual({ x: 9, y: 5 });
  });
});

describe("a Multiple Block during a kick-off turn", () => {
  it("is refused", async () => {
    const { game, home, away } = await rehearse(KickoffEvent.CHARGE, { players: 1 });
    home(1).skills = [getSkill(SkillType.MULTIPLE_BLOCK)];
    home(1).gridPosition = { x: 9, y: 5 };
    away(1).gridPosition = { x: 10, y: 5 };
    away(2).gridPosition = { x: 10, y: 6 };
    await choose(game, [home(1).id]);
    const blocked = await game.execute({
      type: "multiple-block",
      attackerId: home(1).id,
      defender1Id: away(1).id,
      defender2Id: away(2).id,
    });
    expect(blocked.ok).toBe(false);
  });
});

describe("Get Ready, Lads! with fewer players allowed", () => {
  it("preselects no more than the limit", async () => {
    const { game } = await rehearse(KickoffEvent.GET_READY_LADS, { players: 2 });
    expect(game.pendingDecision()).toMatchObject({
      selectionLimit: 2,
      selectedPlayerIds: ["team2-player-1", "team2-player-2"],
    });
  });
});

import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { GamePhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType, getSkill } from "../../src/types/Skills";
import { enumerateDecision } from "../../src/simulation/candidates";
import { computerOwnsDecision } from "../../src/network/computerCoach";
import { matchSaveSchema } from "../../src/boundary/schemas/MatchSave";
import { forceDice } from "../utils/test-helpers";
import { choose, rehearse, settle } from "./kickoffRehearsal";

async function walk(game: HeadlessGame, playerId: string, dx = 1) {
  const player = game.ctx.gameService.getPlayerById(playerId);
  const from = player?.gridPosition;
  if (!from) throw new Error("off the pitch");
  const declared = await game.execute({
    type: "declare-action",
    playerId,
    action: "move",
  });
  const moved = await game.execute({
    type: "move",
    playerId,
    path: [{ x: from.x + dx, y: from.y }],
  });
  return { declared: declared.ok, moved: moved.ok };
}

const played = { declared: true, moved: true };
const refused = { declared: false, moved: false };

async function endActivation(game: HeadlessGame, playerId: string) {
  await game.execute({ type: "end-activation", playerId });
  await settle();
}

function expectReceivingTurn(game: HeadlessGame) {
  const state = game.ctx.gameService.getState();
  expect(state.phase).toBe(GamePhase.PLAY);
  expect(state.activeTeamId).toBe("team2");
  expect(state.turn).toMatchObject({
    teamId: "team2",
    hasBlitzed: false,
    hasThrownTeamMate: false,
    hasKickedTeamMate: false,
  });
  expect(state.turn.activatedPlayerIds.size).toBe(0);
  expect(state.turn.movementUsed.size).toBe(0);
  expect(state.kick?.step ?? null).toBeNull();
  expect(state.activePlayer).toBeNull();
  expect(game.ctx.gameService.getKickoffEventStep()).toBeNull();
}

describe("Charge! as a miniature turn", () => {
  it("plays all four picked players in any order, then ends by itself", async () => {
    const { game, gs, home } = await rehearse(KickoffEvent.CHARGE, { players: 4 });
    const ids = [1, 2, 3, 4].map((index) => home(index).id);
    await choose(game, ids);

    for (const index of [4, 1, 3, 2]) {
      expect(gs.getKickoffEventStep()?.stage).toBe("play");
      expect(await walk(game, home(index).id)).toEqual(played);
      await endActivation(game, home(index).id);
    }

    expectReceivingTurn(game);
    expect([1, 2, 3, 4].map((index) => home(index).gridPosition?.x)).toEqual([
      6, 6, 6, 6,
    ]);
  });

  it("refuses a fifth pick and anyone who was not picked", async () => {
    const { game, gs, home, away } = await rehearse(KickoffEvent.CHARGE, {
      players: 1,
    });
    await game.execute({ type: "kickoff-select-player", playerId: home(1).id });
    const extra = await game.execute({
      type: "kickoff-select-player",
      playerId: home(2).id,
    });
    expect(extra.ok).toBe(false);
    await game.execute({ type: "kickoff-confirm" });

    expect(await walk(game, home(2).id)).toEqual(refused);
    expect(await walk(game, away(2).id, -1)).toEqual(refused);
    expect(gs.hasPlayerActed(home(2).id)).toBe(true);
    expect(gs.hasPlayerActed(away(2).id)).toBe(true);
    expect(gs.canActivate(home(1).id)).toBe(true);
    const jump = await game.execute({
      type: "stand-up",
      playerId: home(2).id,
    });
    expect(jump.ok).toBe(false);
  });

  it("lets the coach switch players before one is committed", async () => {
    const { game, gs, home } = await rehearse(KickoffEvent.CHARGE, { players: 2 });
    await choose(game, [home(1).id, home(2).id]);
    await game.execute({
      type: "declare-action",
      playerId: home(1).id,
      action: "blitz",
    });
    await game.execute({ type: "cancel-action", playerId: home(1).id });
    expect(gs.getState().turn.hasBlitzed).toBe(false);
    expect(await walk(game, home(2).id)).toEqual(played);
    expect(gs.canActivate(home(1).id)).toBe(true);
  });

  it("reopens the picks until somebody has moved", async () => {
    const { game, gs, home } = await rehearse(KickoffEvent.CHARGE, { players: 2 });
    await choose(game, [home(1).id, home(2).id]);
    expect((await game.execute({ type: "kickoff-reselect" })).ok).toBe(true);
    expect(game.pendingDecision()).toMatchObject({
      type: "kickoff-event",
      selectedPlayerIds: [home(1).id, home(2).id],
    });
    await game.execute({ type: "kickoff-select-player", playerId: home(2).id });
    await choose(game, [home(3).id]);
    expect(gs.canActivate(home(2).id)).toBe(false);
    expect(await walk(game, home(3).id)).toEqual(played);
    expect((await game.execute({ type: "kickoff-reselect" })).ok).toBe(false);
  });

  it("allows one Blitz with its Block, and only Moves after it", async () => {
    const { game, gs, home, away } = await rehearse(KickoffEvent.CHARGE, {
      players: 3,
    });
    await choose(game, [home(1).id, home(2).id, home(3).id]);
    home(1).gridPosition = { x: 8, y: 5 };
    away(1).gridPosition = { x: 10, y: 5 };
    await game.execute({
      type: "declare-action",
      playerId: home(1).id,
      action: "blitz",
    });
    await game.execute({
      type: "move",
      playerId: home(1).id,
      path: [{ x: 9, y: 5 }],
    });
    forceDice(game.ctx.rng, [3, 3, 3]);
    const block = await game.execute({
      type: "block",
      attackerId: home(1).id,
      defenderId: away(1).id,
    });
    expect(block.pendingDecision?.type).toBe("block-dice");
    const push =
      block.pendingDecision?.type === "block-dice"
        ? block.pendingDecision.options.findIndex(({ type }) => type === "push")
        : -1;
    expect(push).toBeGreaterThanOrEqual(0);
    await game.execute({ type: "choose-block-result", index: push });
    await settle();
    const direction = game.pendingDecision();
    if (direction?.type === "push-direction")
      await game.execute({
        type: "choose-push-direction",
        x: direction.options[0]?.x ?? 0,
        y: direction.options[0]?.y ?? 0,
      });
    await settle();
    if (game.pendingDecision()?.type === "follow-up")
      await game.execute({ type: "choose-follow-up", followUp: false });
    await endActivation(game, home(1).id);

    expect(away(1).gridPosition).not.toEqual({ x: 10, y: 5 });
    expect(gs.getState().turn.hasBlitzed).toBe(true);
    const second = await game.execute({
      type: "declare-action",
      playerId: home(2).id,
      action: "blitz",
    });
    expect(second.ok).toBe(false);
    expect(await walk(game, home(2).id)).toEqual(played);
  });

  it.each(["block", "pass", "handoff", "foul", "secureBall"] as const)(
    "offers no %s",
    async (action) => {
      const { game, home } = await rehearse(KickoffEvent.CHARGE, { players: 1 });
      await choose(game, [home(1).id]);
      const declared = await game.execute({
        type: "declare-action",
        playerId: home(1).id,
        action,
      });
      expect(declared.ok).toBe(false);
    }
  );

  it("Rushes and Jumps as a normal Move does", async () => {
    const { game, gs, home } = await rehearse(KickoffEvent.CHARGE, { players: 2 });
    await choose(game, [home(1).id, home(2).id]);
    const { x, y } = home(1).gridPosition ?? { x: 0, y: 0 };
    const reach = home(1).stats.MA + 1;
    await game.execute({
      type: "declare-action",
      playerId: home(1).id,
      action: "move",
    });
    forceDice(game.ctx.rng, [6]);
    const rushed = await game.execute({
      type: "move",
      playerId: home(1).id,
      path: Array.from({ length: reach }, (_, step) => ({ x: x + step + 1, y })),
    });
    expect(rushed.ok).toBe(true);
    expect(home(1).gridPosition).toEqual({ x: x + reach, y });
    await endActivation(game, home(1).id);

    const jumper = home(2);
    jumper.skills = [...jumper.skills, getSkill(SkillType.LEAP)];
    jumper.gridPosition = { x: 2, y: 1 };
    home(6).gridPosition = { x: 3, y: 1 };
    home(6).status = PlayerStatus.PRONE;
    await game.execute({
      type: "declare-action",
      playerId: jumper.id,
      action: "move",
    });
    forceDice(game.ctx.rng, [6, 6]);
    const jumped = await game.execute({
      type: "jump",
      playerId: jumper.id,
      x: 4,
      y: 1,
    });
    expect(jumped.ok).toBe(true);
    expect(jumper.gridPosition).toEqual({ x: 4, y: 1 });
    expect(gs.getMovementUsed(jumper.id)).toBe(2);
  });

  it("stands a picked player up before it moves", async () => {
    const { game, home } = await rehearse(KickoffEvent.CHARGE, { players: 1 });
    await choose(game, [home(1).id]);
    home(1).status = PlayerStatus.PRONE;
    const stood = await game.execute({ type: "stand-up", playerId: home(1).id });
    expect(stood.ok).toBe(true);
    expect(home(1).status).toBe(PlayerStatus.ACTIVE);
    expect((await walk(game, home(1).id)).moved).toBe(true);
  });

  it("allows one Throw Team-mate, whose passenger may be anyone", async () => {
    const { game, gs, home } = await rehearse(KickoffEvent.CHARGE, { players: 2 });
    for (const index of [1, 2])
      home(index).skills = [getSkill(SkillType.THROW_TEAM_MATE)];
    home(3).skills = [getSkill(SkillType.RIGHT_STUFF)];
    home(3).stats.ST = 2;
    await choose(game, [home(1).id, home(2).id]);
    const declared = await game.execute({
      type: "declare-action",
      playerId: home(1).id,
      action: "throwTeamMate",
    });
    expect(declared.ok).toBe(true);
    home(3).gridPosition = { x: 6, y: 3 };
    forceDice(game.ctx.rng, [6, 6, 6, 6, 6, 6]);
    await game.execute({
      type: "throw-teammate",
      throwerId: home(1).id,
      teammateId: home(3).id,
      x: 9,
      y: 3,
    });
    await settle();
    expect(home(3).gridPosition).not.toEqual({ x: 6, y: 3 });
    expect(gs.getState().turn.hasThrownTeamMate).toBe(true);
    await endActivation(game, home(1).id);
    const second = await game.execute({
      type: "declare-action",
      playerId: home(2).id,
      action: "throwTeamMate",
    });
    expect(second.ok).toBe(false);
    expect(await walk(game, home(2).id)).toEqual(played);
  });

  it("ends on a fall and lets the kick land", async () => {
    const { game, gs, home, away } = await rehearse(KickoffEvent.CHARGE, {
      players: 3,
    });
    game.ctx.team1.rerolls = 0;
    await choose(game, [home(1).id, home(2).id, home(3).id]);
    home(1).gridPosition = { x: 9, y: 5 };
    away(1).gridPosition = { x: 10, y: 5 };
    await game.execute({
      type: "declare-action",
      playerId: home(1).id,
      action: "move",
    });
    forceDice(game.ctx.rng, [1, 1, 1]);
    const turnovers: unknown[] = [];
    game.ctx.eventBus.on("turnover", (data) => turnovers.push(data));
    await game.execute({
      type: "move",
      playerId: home(1).id,
      path: [{ x: 8, y: 5 }],
    });
    await settle();

    expect(turnovers).toEqual([{ teamId: "team1" }]);
    expect(home(1).status).not.toBe(PlayerStatus.ACTIVE);
    expectReceivingTurn(game);
    expect(gs.isTurnoverInProgress()).toBe(false);
    expect((await walk(game, away(2).id, -1)).moved).toBe(true);
  });

  it("ends early on end-turn", async () => {
    const { game, home } = await rehearse(KickoffEvent.CHARGE, { players: 3 });
    await choose(game, [home(1).id, home(2).id, home(3).id]);
    await walk(game, home(2).id);
    expect((await game.execute({ type: "end-turn" })).ok).toBe(true);
    await settle();
    expectReceivingTurn(game);
  });

  it("lands the kick after a skip, or after starting with nobody", async () => {
    for (const type of ["kickoff-skip", "kickoff-confirm"] as const) {
      const { game } = await rehearse(KickoffEvent.CHARGE, { players: 3 });
      await game.execute({ type });
      await settle();
      expectReceivingTurn(game);
    }
  });

  it("offers the computer the picked player and the end of the event, and keeps the other coach's hands off", async () => {
    const { game, home } = await rehearse(KickoffEvent.CHARGE, { players: 1 });
    await choose(game, [home(1).id]);
    const point = await enumerateDecision(game, "team1");
    expect(point.teamId).toBe("team1");
    expect(point.candidates.map(({ commands }) => commands)).toEqual([
      [{ type: "declare-action", playerId: home(1).id, action: "move" }],
      [{ type: "declare-action", playerId: home(1).id, action: "blitz" }],
      [{ type: "end-turn" }],
    ]);
    expect(computerOwnsDecision(game, "team1", "team1")).toBe(true);
    expect(computerOwnsDecision(game, "team2", "team1")).toBe(false);
    await game.execute({ type: "end-turn" });
    await settle();
    expectReceivingTurn(game);
  });

  it("keeps a Charge through a save, and finishes it in the new session", async () => {
    const { game, home } = await rehearse(KickoffEvent.CHARGE, { players: 2 });
    await choose(game, [home(1).id, home(2).id]);
    await walk(game, home(1).id);
    await game.execute({ type: "end-activation", playerId: home(1).id });
    const save = matchSaveSchema.parse(structuredClone(game.matchSave()));

    const resumed = new HeadlessGame({ matchSave: save });
    const gs = resumed.ctx.gameService;
    expect(gs.getKickoffEventStep()).toMatchObject({
      stage: "play",
      movedPlayerIds: [home(1).id],
    });
    expect(gs.canActivate(home(1).id)).toBe(false);
    expect(await walk(resumed, home(2).id)).toEqual(played);
    await endActivation(resumed, home(2).id);
    expectReceivingTurn(resumed);
  });
});

describe.each([
  { event: KickoffEvent.ALERT_DEFENCE, side: "home" as const },
  { event: KickoffEvent.QUICK_SNAP, side: "away" as const },
])("$event as a one-square turn", ({ event, side }) => {
  it("moves each picked player one square in any order, with no dice", async () => {
    const run = await rehearse(event, { players: 2 });
    const { game } = run;
    const player = run[side];
    await choose(game, [player(1).id, player(2).id]);
    for (const index of [2, 1]) {
      const { x, y } = player(index).gridPosition ?? { x: 0, y: 0 };
      const moved = await game.execute({
        type: "kickoff-move-player",
        playerId: player(index).id,
        x: x + (side === "home" ? 1 : -1),
        y,
      });
      expect(moved.ok).toBe(true);
    }
    await settle();
    expectReceivingTurn(game);
  });

  it("refuses two squares, an unpicked player and a second step", async () => {
    const run = await rehearse(event, { players: 2 });
    const { game } = run;
    const player = run[side];
    await choose(game, [player(1).id, player(2).id]);
    const step = (index: number, dx: number) => {
      const { x, y } = player(index).gridPosition ?? { x: 0, y: 0 };
      return game.execute({
        type: "kickoff-move-player",
        playerId: player(index).id,
        x: x + dx,
        y,
      });
    };
    expect((await step(1, 2)).ok).toBe(false);
    expect((await step(3, 1)).ok).toBe(false);
    expect((await step(1, -1)).ok).toBe(true);
    expect((await step(1, 1)).ok).toBe(false);
    expect((await walk(game, player(2).id)).moved).toBe(false);
    await game.execute({ type: "end-turn" });
    await settle();
    expectReceivingTurn(game);
  });
});

describe("the other kick-off turns", () => {
  it("Blitz! allows no Kick Team-mate outside Sevens' Charge!", async () => {
    const { game, home } = await rehearse(KickoffEvent.BLITZ, { players: 1 });
    home(1).skills = [getSkill(SkillType.KICK_TEAM_MATE)];
    await choose(game, [home(1).id]);
    const declared = await game.execute({
      type: "declare-action",
      playerId: home(1).id,
      action: "throwTeamMate",
    });
    expect(declared.ok).toBe(false);
  });

  it("Quick Attack lets its one player Block and nothing else", async () => {
    const { game, gs, home, away } = await rehearse(KickoffEvent.QUICK_ATTACK);
    expect(game.pendingDecision()).toMatchObject({ selectionLimit: 1 });
    home(1).gridPosition = { x: 9, y: 5 };
    away(1).gridPosition = { x: 10, y: 5 };
    await choose(game, [home(1).id]);
    expect((await walk(game, home(1).id, -1)).declared).toBe(false);
    const block = await game.execute({
      type: "declare-action",
      playerId: home(1).id,
      action: "block",
    });
    expect(block.ok).toBe(true);
    expect(gs.getState().activePlayer?.action).toBe("block");
  });

  it("Get Ready, Lads! starts with every Open receiver picked", async () => {
    const { game } = await rehearse(KickoffEvent.GET_READY_LADS);
    const pending = game.pendingDecision();
    expect(
      pending?.type === "kickoff-event" ? pending.selectedPlayerIds.length : 0
    ).toBe(7);
  });
});

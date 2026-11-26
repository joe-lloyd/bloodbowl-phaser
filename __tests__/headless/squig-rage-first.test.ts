import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { newKick } from "../../src/game/kickoff/kickRecord";
import { openedKickoffTurn } from "../../src/game/kickoff/kickoffTurn";
import { opensWithSquigRage } from "../../src/game/rules/awaitingDeclaration";
import { checkOwnership } from "../../src/network/OwnershipGate";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerCondition, PlayerStatus } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";
import type { Scenario } from "../../src/types/Scenario";
import { GameEventNames, type ActionType } from "../../src/types/events";
import { forceDice } from "../utils/test-helpers";

type Placements = NonNullable<Scenario["setup"]["team1Placements"]>;

const HOPPER = 0;
const WRANGLER = 1;
const HERDER = 2;
const LINEMAN = 3;
const MATE = 4;
const FAR_OPPONENT = { playerIndex: 0, x: 24, y: 2 };

function match(mates: Placements, opponents: Placements = [FAR_OPPONENT]) {
  const game = new HeadlessGame({
    seed: 7,
    scenario: {
      id: "squig-rage-first",
      name: "Squig Rage before the action",
      description: "Roll Squig Rage before choosing an action",
      setup: {
        team1Roster: RosterName.NIGHT_GOBLIN,
        team1Placements: [
          { playerIndex: HOPPER, x: 15, y: 8 },
          { playerIndex: LINEMAN, x: 3, y: 3 },
          ...mates,
        ],
        team2Placements: opponents,
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 20, y: 2 },
      },
    },
  });
  game.ctx.team1.rerolls = 0;
  const gs = game.ctx.gameService;
  const rolls: string[] = [];
  game.ctx.eventBus.on(GameEventNames.DiceRoll, ({ rollType }) => {
    rolls.push(rollType);
  });
  const player = (index: number) =>
    fixtureValue(game.ctx.team1.players[index]);
  return {
    game,
    gs,
    rolls,
    hopper: player(HOPPER),
    player,
    rage: (playerId = player(HOPPER).id) =>
      game.execute({ type: "roll-squig-rage", playerId }),
    declare: (action: ActionType, playerId = player(HOPPER).id) =>
      game.execute({ type: "declare-action", playerId, action }),
    turnFlags: () => {
      const turn = gs.getState().turn;
      return [turn.hasBlitzed, turn.hasPassed, turn.hasHandedOff, turn.hasFouled];
    },
  };
}

const rageRolls = (rolls: string[]) =>
  rolls.filter((roll) => roll.startsWith("Squig Rage"));

describe("Squig Rage rolled before an action is chosen", () => {
  it("waits for the coach's action after a pass and never rolls again", async () => {
    const { game, gs, hopper, rolls, rage, declare } = match([]);
    forceDice(game.ctx.rng, [3]);
    const rolled = await rage();
    expect(rolled.ok).toBe(true);
    expect(rolled.pendingDecision).toBeNull();
    expect(gs.getState().activePlayer).toEqual({
      id: hopper.id,
      action: null,
      squigRageSettled: true,
      stalling: false,
    });
    expect(rageRolls(rolls)).toHaveLength(1);

    const blitz = await declare("blitz");
    expect(blitz.ok).toBe(true);
    expect(gs.getState().activePlayer?.action).toBe("blitz");
    expect(rageRolls(rolls)).toHaveLength(1);
  });

  it("lets the coach pick any action after a pass, including a Handoff", async () => {
    const { game, gs, hopper, rage, declare } = match([
      { playerIndex: MATE, x: 15, y: 9 },
    ]);
    gs.getState().ballPosition = { ...fixtureValue(hopper.gridPosition) };
    forceDice(game.ctx.rng, [6]);
    await rage();
    const handoff = await declare("handoff");
    expect(handoff.ok).toBe(true);
    expect(gs.getState().activePlayer?.action).toBe("handoff");
  });

  it("keeps the squig activated once the roll is made", async () => {
    const { game, gs, hopper, player, rage, declare } = match([]);
    forceDice(game.ctx.rng, [4]);
    await rage();
    const cancelled = await game.execute({
      type: "cancel-action",
      playerId: hopper.id,
    });
    expect(cancelled.ok).toBe(false);
    expect(gs.hasPlayerActed(hopper.id)).toBe(false);

    const other = await declare("move", player(LINEMAN).id);
    expect(other.ok).toBe(true);
    expect(gs.hasPlayerActed(hopper.id)).toBe(true);
  });

  it("forces a Block on an adjacent opponent and spends no once-per-turn action", async () => {
    const { game, gs, hopper, rage, turnFlags } = match(
      [],
      [{ playerIndex: 0, x: 16, y: 8 }]
    );
    forceDice(game.ctx.rng, [1]);
    const rolled = await rage();
    expect(rolled.pendingDecision).toMatchObject({
      type: "block-dice",
      attackerId: hopper.id,
      defenderId: fixtureValue(game.ctx.team2.players[0]).id,
    });
    expect(gs.getState().activePlayer).toMatchObject({
      id: hopper.id,
      action: "block",
      forcedBlock: true,
    });
    expect(turnFlags()).toEqual([false, false, false, false]);
  });

  it("makes the squig Distracted with nobody near and leaves every action for the team", async () => {
    const { game, gs, hopper, player, rage, declare, turnFlags } = match([]);
    forceDice(game.ctx.rng, [2]);
    const rolled = await rage();
    expect(rolled.pendingDecision).toBeNull();
    expect(hopper.conditions).toContainEqual({ type: PlayerCondition.DISTRACTED });
    expect(gs.hasPlayerActed(hopper.id)).toBe(true);
    expect(gs.getState().activePlayer).toBeNull();
    expect(turnFlags()).toEqual([false, false, false, false]);
    const blitz = await declare("blitz", player(LINEMAN).id);
    expect(blitz.ok).toBe(true);
  });

  it("knocks down a chosen team-mate, rolls Armour, then waits for an action without a second roll", async () => {
    const { game, gs, hopper, player, rolls, rage, declare } = match([
      { playerIndex: MATE, x: 15, y: 9 },
    ]);
    const mate = player(MATE);
    forceDice(game.ctx.rng, [1]);
    const rolled = await rage();
    expect(rolled.pendingDecision).toMatchObject({
      type: "bite-target",
      purpose: "squig-knock-down",
      targetIds: [mate.id],
    });
    await game.execute({ type: "choose-bite-target", playerId: mate.id });
    expect(mate.status).not.toBe(PlayerStatus.ACTIVE);
    expect(rolls.some((roll) => roll.startsWith("Armour"))).toBe(true);
    expect(gs.getState().activePlayer).toMatchObject({
      id: hopper.id,
      action: null,
      squigRageSettled: true,
    });

    const blitz = await declare("blitz");
    expect(blitz.ok).toBe(true);
    expect(rageRolls(rolls)).toHaveLength(1);
    expect(gs.getState().turn.hasBlitzed).toBe(false);
  });

  it("offers a team re-roll on the Squig Rage roll", async () => {
    const { game, gs, hopper, rolls, rage } = match([]);
    game.ctx.team1.rerolls = 1;
    forceDice(game.ctx.rng, [1, 5]);
    const rolled = await rage();
    expect(rolled.pendingDecision?.type).toBe("reroll");
    await game.execute({ type: "use-reroll", accept: true });
    expect(rageRolls(rolls)).toHaveLength(2);
    expect(hopper.conditions ?? []).toEqual([]);
    expect(gs.getState().activePlayer).toMatchObject({
      id: hopper.id,
      action: null,
      squigRageSettled: true,
    });
  });

  it("clears last turn's Distracted when the activation starts", async () => {
    const { game, hopper, rage } = match([]);
    hopper.conditions = [{ type: PlayerCondition.DISTRACTED }];
    forceDice(game.ctx.rng, [5]);
    await rage();
    expect(hopper.conditions).toEqual([]);
  });

  it("ends one squig's open activation when another squig rolls", async () => {
    const { game, gs, hopper, player, rolls, rage } = match([
      { playerIndex: WRANGLER, x: 10, y: 5 },
    ]);
    const wrangler = player(WRANGLER);
    forceDice(game.ctx.rng, [4, 4]);
    await rage();
    const second = await rage(wrangler.id);
    expect(second.ok).toBe(true);
    expect(gs.hasPlayerActed(hopper.id)).toBe(true);
    expect(gs.getState().activePlayer).toMatchObject({
      id: wrangler.id,
      action: null,
    });
    expect(rageRolls(rolls)).toHaveLength(2);
  });

  it("refuses the roll when a standing Herder is within three squares", async () => {
    const { gs, rolls, rage, declare } = match([
      { playerIndex: HERDER, x: 12, y: 11 },
    ]);
    const refused = await rage();
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe("command-failed: no-squig-rage-roll");
    expect(gs.getState().activePlayer).toBeNull();
    const blitz = await declare("blitz");
    expect(blitz.ok).toBe(true);
    expect(rolls).toEqual([]);
  });

  it("rolls when the only Herder in range is Prone", async () => {
    const { game, player, rolls, rage } = match([
      { playerIndex: HERDER, x: 12, y: 11, status: PlayerStatus.PRONE },
    ]);
    expect(player(HERDER).status).toBe(PlayerStatus.PRONE);
    forceDice(game.ctx.rng, [6]);
    const rolled = await rage();
    expect(rolled.ok).toBe(true);
    expect(rageRolls(rolls)).toHaveLength(1);
  });

  it("refuses a second roll, a player without Squig Rage and a squig that has acted", async () => {
    const { game, gs, player, rolls, rage } = match([
      { playerIndex: WRANGLER, x: 10, y: 5 },
    ]);
    forceDice(game.ctx.rng, [4, 1]);
    await rage();
    const again = await rage();
    expect(again.ok).toBe(false);
    const lineman = await rage(player(LINEMAN).id);
    expect(lineman.ok).toBe(false);

    const wrangler = player(WRANGLER);
    await rage(wrangler.id);
    expect(gs.hasPlayerActed(wrangler.id)).toBe(true);
    const acted = await rage(wrangler.id);
    expect(acted.ok).toBe(false);
    expect(rageRolls(rolls)).toHaveLength(2);
  });

  it("refuses the roll on the opponent's turn and from the opponent's coach online", async () => {
    const { game, gs, hopper, rolls, rage } = match([]);
    gs.getState().turn.teamId = game.ctx.team2.id;
    gs.getState().activeTeamId = game.ctx.team2.id;
    const refused = await rage();
    expect(refused.ok).toBe(false);
    expect(rolls).toEqual([]);

    const verdict = checkOwnership(
      { type: "roll-squig-rage", playerId: hopper.id },
      game.ctx.team2.id,
      {
        activeTeamId: game.ctx.team1.id,
        pendingDecision: null,
        hostTeamId: game.ctx.team1.id,
        phase: GamePhase.PLAY,
        teamIdOfPlayer: (id) => gs.getPlayerById(id)?.teamId,
      }
    );
    expect(verdict.allowed).toBe(false);
  });
});

function kickoffState(event: KickoffEvent) {
  const { game, gs, hopper } = match([]);
  const state = gs.getState();
  const opened = fixtureValue(
    openedKickoffTurn(
      state,
      {
        event,
        teamId: hopper.teamId,
        playerIds: [hopper.id],
        selectionLimit: 1,
      },
      game.ctx.team1.players
    )
  );
  const kick = { ...newKick(hopper.teamId, "event"), step: opened.step };
  return {
    hopper,
    mates: game.ctx.team1.players,
    at: { phase: GamePhase.KICKOFF, kick, activePlayer: null },
  };
}

describe("which activations open with a Squig Rage roll", () => {
  it("opens a kickoff Blitz activation with the roll", () => {
    const { hopper, mates, at } = kickoffState(KickoffEvent.BLITZ);
    expect(opensWithSquigRage(at, hopper, mates)).toBe(true);
  });

  it("skips the roll for a Quick Snap step, which is not an activation", () => {
    const { hopper, mates, at } = kickoffState(KickoffEvent.QUICK_SNAP);
    expect(opensWithSquigRage(at, hopper, mates)).toBe(false);
  });

  it("skips the roll when the squig is already the active player", () => {
    const { hopper, mates, at } = kickoffState(KickoffEvent.BLITZ);
    const active = { ...at, activePlayer: { id: hopper.id, action: null } };
    expect(opensWithSquigRage(active, hopper, mates)).toBe(false);
  });
});

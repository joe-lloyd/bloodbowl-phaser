import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { enumerateDecision } from "../../src/simulation/candidates";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { newKick } from "../../src/game/kickoff/kickRecord";
import {
  mayReselect,
  openedKickoffTurn,
} from "../../src/game/kickoff/kickoffTurn";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";
import type { Scenario } from "../../src/types/Scenario";
import { GameEventNames } from "../../src/types/events";
import { SkillType, getSkill } from "../../src/types/Skills";
import { forceDice } from "../utils/test-helpers";
import { defaultAnswer } from "../../src/network/decisionTimeouts";

type Placements = NonNullable<Scenario["setup"]["team1Placements"]>;

function match(mates: Placements, opponents: Placements, seed = 7) {
  const game = new HeadlessGame({
    seed,
    scenario: {
      id: "night-goblin-rage",
      name: "Night Goblin activation",
      description: "Activate the Squig Wrangler",
      setup: {
        team1Roster: RosterName.NIGHT_GOBLIN,
        team1Placements: [
          { playerIndex: 1, x: 10, y: 5 },
          { playerIndex: 3, x: 3, y: 3 },
          ...mates,
        ],
        team2Placements: opponents,
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 13, y: 7 },
      },
    },
  });
  const wrangler = fixtureValue(game.ctx.teams[0].players[1]);
  const rolls: string[] = [];
  game.ctx.eventBus.on(GameEventNames.DiceRoll, ({ rollType }) => {
    rolls.push(rollType);
  });
  return {
    game,
    wrangler,
    rolls,
    declare: () =>
      game.execute({
        type: "declare-action",
        playerId: wrangler.id,
        action: "ballAndChain",
      }),
  };
}

const OPPONENT = { playerIndex: 0, x: 11, y: 5 };

async function ragedHopper() {
  const { game, rolls } = match(
    [
      { playerIndex: 0, x: 14, y: 8 },
      { playerIndex: 5, x: 14, y: 9 },
    ],
    [{ ...OPPONENT, x: 24 }]
  );
  const hopper = fixtureValue(game.ctx.teams[0].players[0]);
  const receiver = fixtureValue(game.ctx.teams[0].players[5]);
  game.ctx.teams[0].rerolls = 0;
  const gs = game.ctx.gameService;
  gs.getState().ballPosition = { ...fixtureValue(hopper.gridPosition) };
  let response = await game.execute({
    type: "declare-action",
    playerId: hopper.id,
    action: "handoff",
  });
  if (response.pendingDecision?.type === "bite-target") {
    response = await game.execute({
      type: "choose-bite-target",
      playerId: receiver.id,
    });
  }
  expect(response.ok).toBe(true);
  expect(receiver.status).not.toBe(PlayerStatus.ACTIVE);
  const declare = (
    action: "move" | "handoff",
    playerId = hopper.id
  ) => game.execute({ type: "declare-action", playerId, action });
  return { game, gs, hopper, rolls, declare };
}

describe("Squig Rage", () => {
  it("makes the Wrangler Block an adjacent opponent even with Ball & Chain", async () => {
    const { game, wrangler, declare } = match(
      [{ playerIndex: 4, x: 10, y: 4 }],
      [OPPONENT]
    );
    const response = await declare();
    expect(response.pendingDecision).toMatchObject({
      type: "block-dice",
      attackerId: wrangler.id,
      defenderId: fixtureValue(game.ctx.teams[1].players[0]).id,
    });
    const resolved = await game.execute({
      type: "choose-block-result",
      index: 2,
    });
    expect(resolved.ok).toBe(true);
    const pending = resolved.pendingDecision;
    if (pending?.type === "push-direction") {
      const square = fixtureValue(pending.options[0]);
      await game.execute({
        type: "choose-push-direction",
        x: square.x,
        y: square.y,
      });
    }
    if (game.pendingDecision()?.type === "follow-up") {
      await game.execute({ type: "choose-follow-up", followUp: false });
    }
    expect(game.ctx.gameService.hasPlayerActed(wrangler.id)).toBe(true);
  });

  it("checks Foul Appearance before a Wrangler can make a forced Block", async () => {
    const { game, wrangler, rolls, declare } = match([], [
      { ...OPPONENT, skills: [SkillType.FOUL_APPEARANCE] },
    ]);
    const response = await declare();
    expect(rolls).toContain(`Foul Appearance (${wrangler.playerName})`);
    expect(rolls).not.toContain("Block Roll");
    expect(response.pendingDecision).toBeNull();
    expect(game.ctx.gameService.hasPlayerActed(wrangler.id)).toBe(true);
  });

  it("requires the coach to choose an opponent when more than one can be Blocked", async () => {
    const { game, wrangler, declare } = match(
      [],
      [
        { ...OPPONENT, x: 9 },
        { playerIndex: 1, x: 11, y: 5 },
      ]
    );
    const [left, right] = game.ctx.teams[1].players.map((player) => player.id);
    const response = await declare();
    const pending = fixtureValue(response.pendingDecision);
    expect(pending).toMatchObject({
      type: "bite-target",
      purpose: "squig-block",
      targetIds: [left, right],
    });
    expect(defaultAnswer(pending)).toEqual({
      type: "choose-bite-target",
      playerId: left,
    });
    expect(game.ctx.gameService.cancelAction(wrangler.id)).toBe(false);
    const noTargetChosen = await game.execute({ type: "choose-bite-target" });
    expect(noTargetChosen.ok).toBe(false);
    const roll = await game.execute({
      type: "choose-bite-target",
      playerId: fixtureValue(right),
    });
    expect(roll.pendingDecision).toMatchObject({
      type: "block-dice",
      attackerId: wrangler.id,
      defenderId: right,
    });
  });

  it.each([
    [SkillType.PRO, "proAvailable"],
    [SkillType.BRAWLER, "brawlerAvailable"],
  ] as const)("offers %s on a forced Block", async (skill, available) => {
    const { game, wrangler, declare } = match([], [OPPONENT], 8);
    wrangler.skills.push(getSkill(skill));
    const rage = await declare();
    const block =
      rage.pendingDecision?.type === "reroll"
        ? await game.execute({ type: "use-reroll", accept: false })
        : rage;
    expect(block.pendingDecision).toMatchObject({
      type: "block-dice",
      [available]: true,
    });
  });

  it("knocks down a chosen team-mate, rolls Armour and continues the activation", async () => {
    const { game, wrangler, rolls, declare } = match(
      [{ playerIndex: 4, x: 10, y: 4 }],
      [{ ...OPPONENT, x: 13 }]
    );
    const target = fixtureValue(game.ctx.teams[0].players[4]);
    const failed = await declare();
    expect(failed.pendingDecision).toMatchObject({
      type: "bite-target",
      purpose: "squig-knock-down",
      targetIds: [target.id],
    });
    const targetChosen = await game.execute({
      type: "choose-bite-target",
      playerId: target.id,
    });
    expect(targetChosen.ok).toBe(true);
    expect(target.status).not.toBe(PlayerStatus.ACTIVE);
    expect(rolls.some((type) => type.includes("Armour"))).toBe(true);
    expect(game.ctx.gameService.getState().activePlayer).toMatchObject({
      id: wrangler.id,
      action: null,
    });
    const rolled = rolls.length;
    const redeclared = await declare();
    expect(redeclared.ok).toBe(true);
    expect(rolls).toHaveLength(rolled);
    expect(game.ctx.gameService.getState().activePlayer?.action).toBe(
      "ballAndChain"
    );
  });

  describe("after a Hopper's Handoff knocks down its only receiver", () => {
    it("leaves the Handoff unspent and lets the Hopper Move without a second roll", async () => {
      const { gs, rolls, declare } = await ragedHopper();
      const rolled = rolls.length;
      expect(gs.getState().turn.spend.handOffs).toBe(0);
      const moveDeclared = await declare("move");
      expect(moveDeclared.ok).toBe(true);
      expect(gs.getState().activePlayer?.action).toBe("move");
      expect(gs.getState().turn.spend.handOffs).toBe(0);
      expect(rolls).toHaveLength(rolled);
    });

    it("lets a fresh declaration be cancelled without reopening the roll", async () => {
      const { game, gs, hopper, rolls, declare } = await ragedHopper();
      const rolled = rolls.length;
      await declare("handoff");
      const cancelled = await game.execute({
        type: "cancel-action",
        playerId: hopper.id,
      });
      expect(cancelled.ok).toBe(true);
      expect(gs.getState().activePlayer).toMatchObject({
        id: hopper.id,
        action: null,
      });
      const moveDeclared = await declare("move");
      expect(moveDeclared.ok).toBe(true);
      expect(rolls).toHaveLength(rolled);
      expect(gs.getState().turn.spend.handOffs).toBe(0);
    });

    it("ends the Hopper's activation when another player is declared", async () => {
      const { game, gs, hopper, declare } = await ragedHopper();
      const other = fixtureValue(game.ctx.teams[0].players[3]);
      const otherDeclared = await declare("move", other.id);
      expect(otherDeclared.ok).toBe(true);
      expect(gs.hasPlayerActed(hopper.id)).toBe(true);
      expect(gs.getState().turn.spend.handOffs).toBe(0);
    });

    it("keeps the Hopper's activation when another player's declaration is refused", async () => {
      const { game, gs, hopper, declare } = await ragedHopper();
      const other = fixtureValue(game.ctx.teams[0].players[3]);
      const refuse = () =>
        game.execute({
          type: "declare-action",
          playerId: other.id,
          action: "chomp",
        });
      const firstRefusal = await refuse();
      expect(firstRefusal.ok).toBe(false);
      expect(gs.hasPlayerActed(hopper.id)).toBe(false);
      const handoffDeclared = await declare("handoff");
      expect(handoffDeclared.ok).toBe(true);
      const held = structuredClone(gs.getState().activePlayer);
      const secondRefusal = await refuse();
      expect(secondRefusal.ok).toBe(false);
      expect(gs.getState().activePlayer).toEqual(held);
      const otherHandoffDeclared = await declare("handoff", other.id);
      expect(otherHandoffDeclared.ok).toBe(true);
      expect(gs.hasPlayerActed(hopper.id)).toBe(true);
      expect(gs.getState().turn.spend.handOffs).toBe(0);
    });

    it("rolls Bone Head but not Squig Rage again when the Hopper redeclares", async () => {
      const { game, gs, hopper, rolls, declare } = await ragedHopper();
      hopper.skills.push(getSkill(SkillType.BONE_HEAD));
      const rolled = rolls.length;
      forceDice(game.ctx.rng, [1]);
      const moveDeclared = await declare("move");
      expect(moveDeclared.ok).toBe(true);
      expect(rolls.slice(rolled)).toEqual([
        expect.stringContaining("Bone Head"),
      ]);
      expect(hopper.conditions).toContainEqual({ type: "Distracted" });
      expect(gs.hasPlayerActed(hopper.id)).toBe(true);
    });

    it("stands a prone Hopper up after it passes Bone Head", async () => {
      const { game, hopper } = await ragedHopper();
      hopper.status = PlayerStatus.PRONE;
      hopper.skills.push(getSkill(SkillType.BONE_HEAD));
      forceDice(game.ctx.rng, [6, 6]);
      const stood = await game.execute({
        type: "stand-up",
        playerId: hopper.id,
      });
      expect(stood.ok).toBe(true);
      expect(hopper.status).toBe(PlayerStatus.ACTIVE);
    });

    it("keeps the kickoff picks locked once Squig Rage has resolved", async () => {
      const { gs, hopper } = await ragedHopper();
      const state = gs.getState();
      const turn = openedKickoffTurn(
        state,
        {
          event: KickoffEvent.BLITZ,
          teamId: hopper.teamId,
          playerIds: [hopper.id],
          selectionLimit: 1,
        },
        []
      );
      const { step, turn: data } = fixtureValue(turn);
      const kick = { ...newKick(hopper.teamId, "event"), step };
      expect(mayReselect({ ...state, turn: data, kick })).toBe(false);
      expect(
        mayReselect({ ...state, turn: data, kick, activePlayer: null })
      ).toBe(true);
    });

    it("refuses to move before the coach declares again", async () => {
      const { game, hopper } = await ragedHopper();
      const start = { ...fixtureValue(hopper.gridPosition) };
      await game.execute({
        type: "move",
        playerId: hopper.id,
        path: [{ x: start.x + 1, y: start.y }],
      });
      expect(hopper.gridPosition).toEqual(start);
    });

    it("offers the computer only the Hopper's actions and an early end", async () => {
      const { game, hopper } = await ragedHopper();
      const { candidates } = fixtureValue(await enumerateDecision(game, null));
      expect(candidates.at(-1)?.kind).toBe("end-activation");
      expect(
        candidates.every((c) =>
          c.commands.every(
            (command) =>
              "playerId" in command && command.playerId === hopper.id
          )
        )
      ).toBe(true);
    });
  });

  it("ends the activation with Distracted when there is nobody nearby", async () => {
    const { game, wrangler, declare } = match([], [{ ...OPPONENT, x: 13 }]);
    const nobodyNearby = await declare();
    expect(nobodyNearby.pendingDecision).toBeNull();
    expect(wrangler.conditions).toContainEqual({ type: "Distracted" });
    expect(game.ctx.gameService.hasPlayerActed(wrangler.id)).toBe(true);
  });

  it("drops a swing queued during the re-roll prompt when Rage ends the activation", async () => {
    const { game, wrangler, rolls, declare } = match([], [
      { ...OPPONENT, x: 13 },
    ]);
    game.ctx.teams[0].rerolls = 1;
    const rerollDeclared = await declare();
    expect(rerollDeclared.pendingDecision?.type).toBe("reroll");
    void game.ctx.gameService.ballAndChain(wrangler.id, 1, 0);
    await game.execute({ type: "use-reroll", accept: false });
    expect(wrangler.conditions).toContainEqual({ type: "Distracted" });
    expect(wrangler.gridPosition).toEqual({ x: 10, y: 5 });
    expect(rolls).not.toContain("Ball & Chain Deviation");
  });

  it("drops a queued swing when Rage knocks down the ball carrier", async () => {
    const { game, wrangler, rolls, declare } = match(
      [{ playerIndex: 4, x: 9, y: 5 }],
      [{ ...OPPONENT, x: 18 }]
    );
    const carrier = fixtureValue(game.ctx.teams[0].players[4]);
    game.ctx.gameService.getState().ballPosition = { x: 9, y: 5 };
    game.ctx.teams[0].rerolls = 1;
    const turnovers: string[] = [];
    game.ctx.eventBus.on(GameEventNames.Turnover, ({ teamId }) => {
      turnovers.push(teamId);
    });
    const rerollDeclared = await declare();
    expect(rerollDeclared.pendingDecision?.type).toBe("reroll");
    void game.ctx.gameService.ballAndChain(wrangler.id, 1, 0);
    let response = await game.execute({ type: "use-reroll", accept: false });
    if (response.pendingDecision?.type === "bite-target") {
      response = await game.execute({
        type: "choose-bite-target",
        playerId: carrier.id,
      });
    }
    expect(response.ok).toBe(true);
    expect(carrier.status).not.toBe(PlayerStatus.ACTIVE);
    expect(turnovers).toEqual([game.ctx.teams[0].id]);
    expect(wrangler.gridPosition).toEqual({ x: 10, y: 5 });
    expect(rolls).not.toContain("Ball & Chain Deviation");
  });

  it("refuses a Chomp clicked during the re-roll prompt when Rage forces a Block", async () => {
    const { game, rolls } = match(
      [{ playerIndex: 0, x: 15, y: 8 }],
      [{ ...OPPONENT, x: 16, y: 8 }]
    );
    const hopper = fixtureValue(game.ctx.teams[0].players[0]);
    const target = fixtureValue(game.ctx.teams[1].players[0]);
    hopper.skills.push(getSkill(SkillType.MONSTROUS_MOUTH));
    game.ctx.teams[0].rerolls = 1;
    forceDice(game.ctx.rng, [1]);
    const declared = await game.execute({
      type: "declare-action",
      playerId: hopper.id,
      action: "chomp",
    });
    expect(declared.pendingDecision?.type).toBe("reroll");
    expect(
      await game.ctx.gameService.performSpecialAction(
        "chomp",
        hopper.id,
        target.id
      )
    ).toBe(false);
    const block = await game.execute({ type: "use-reroll", accept: false });
    expect(block.pendingDecision?.type).toBe("block-dice");
    expect(rolls.some((type) => type.includes("Chomp"))).toBe(false);
    expect(target.conditions ?? []).toEqual([]);
    expect(game.ctx.gameService.getState().activePlayer).toMatchObject({
      id: hopper.id,
      action: "block",
    });
  });

  it("keeps the Blitz when a Chomp is clicked during the re-roll prompt", async () => {
    const { game } = match(
      [{ playerIndex: 0, x: 15, y: 8 }],
      [{ ...OPPONENT, x: 16, y: 8 }]
    );
    const hopper = fixtureValue(game.ctx.teams[0].players[0]);
    const target = fixtureValue(game.ctx.teams[1].players[0]);
    const gs = game.ctx.gameService;
    hopper.skills.push(getSkill(SkillType.MONSTROUS_MOUTH));
    game.ctx.teams[0].rerolls = 1;
    forceDice(game.ctx.rng, [1]);
    await game.execute({
      type: "declare-action",
      playerId: hopper.id,
      action: "blitz",
      blockReplacement: "chomp",
    });
    await gs.performSpecialAction("chomp", hopper.id, target.id);
    await game.execute({ type: "use-reroll", accept: false });
    expect(gs.getState().turn.spend.blitzed).toHaveLength(0);
    expect(gs.getMovementUsed(hopper.id)).toBe(0);
  });

  it("keeps the Punt when it is clicked during the re-roll prompt", async () => {
    const { game } = match(
      [
        { playerIndex: 0, x: 15, y: 8 },
        { playerIndex: 5, x: 15, y: 9 },
      ],
      [{ ...OPPONENT, x: 24 }]
    );
    const hopper = fixtureValue(game.ctx.teams[0].players[0]);
    const mate = fixtureValue(game.ctx.teams[0].players[5]);
    const gs = game.ctx.gameService;
    hopper.skills.push(getSkill(SkillType.PUNT));
    gs.getState().ballPosition = { x: 15, y: 8 };
    game.ctx.teams[0].rerolls = 1;
    forceDice(game.ctx.rng, [1]);
    const declare = () =>
      game.execute({
        type: "declare-action",
        playerId: hopper.id,
        action: "punt",
      });
    await declare();
    await gs.puntBall(hopper.id, 1, 0);
    await game.execute({ type: "use-reroll", accept: false });
    await game.execute({ type: "choose-bite-target", playerId: mate.id });
    expect(gs.getState().ballPosition).toEqual({ x: 15, y: 8 });
    const declaredAgain = await declare();
    expect(declaredAgain.ok).toBe(true);
  });

  it("refuses a Gaze clicked before Bloodlust changes the action to Move", async () => {
    const { game, rolls } = match(
      [{ playerIndex: 5, x: 15, y: 8 }],
      [{ ...OPPONENT, x: 16, y: 8 }]
    );
    const gazer = fixtureValue(game.ctx.teams[0].players[5]);
    const target = fixtureValue(game.ctx.teams[1].players[0]);
    const gs = game.ctx.gameService;
    gazer.skills.push(
      getSkill(SkillType.HYPNOTIC_GAZE),
      { ...getSkill(SkillType.BLOODLUST), parameter: "3+" }
    );
    game.ctx.teams[0].rerolls = 1;
    forceDice(game.ctx.rng, [1]);
    const declared = await game.execute({
      type: "declare-action",
      playerId: gazer.id,
      action: "gaze",
    });
    expect(declared.pendingDecision?.type).toBe("reroll");
    expect(await gs.performSpecialAction("gaze", gazer.id, target.id)).toBe(
      false
    );
    await game.execute({ type: "use-reroll", accept: false });
    await game.execute({ type: "use-reaction", accept: true });
    expect(gs.getState().activePlayer?.action).toBe("move");
    expect(rolls.some((type) => type.includes("Gaze"))).toBe(false);
  });

  it("lets Steady Footing save a ball carrier from the knockdown", async () => {
    const { game, wrangler, declare } = match(
      [{ playerIndex: 4, x: 9, y: 5, skills: [SkillType.STEADY_FOOTING] }],
      [{ ...OPPONENT, x: 18 }]
    );
    const carrier = fixtureValue(game.ctx.teams[0].players[4]);
    const { gameService } = game.ctx;
    gameService.getState().ballPosition = { x: 9, y: 5 };
    game.ctx.teams[0].rerolls = 0;
    forceDice(game.ctx.rng, [1, 6]);
    const turnovers: string[] = [];
    game.ctx.eventBus.on(GameEventNames.Turnover, ({ teamId }) => {
      turnovers.push(teamId);
    });
    const raged = await declare();
    if (raged.pendingDecision?.type === "bite-target") {
      await game.execute({ type: "choose-bite-target", playerId: carrier.id });
    }
    expect(carrier.status).toBe(PlayerStatus.ACTIVE);
    expect(gameService.getState().ballPosition).toEqual({ x: 9, y: 5 });
    expect(turnovers).toEqual([]);
    expect(gameService.getState().activePlayer).toMatchObject({
      id: wrangler.id,
      action: null,
    });
  });

  it("skips the roll with a standing Herder three squares away diagonally", async () => {
    const { game, rolls, wrangler, declare } = match(
      [{ playerIndex: 2, x: 7, y: 8 }],
      [OPPONENT]
    );
    const noRoll = await declare();
    expect(noRoll.pendingDecision).toBeNull();
    expect(rolls).toEqual([]);
    expect(game.ctx.gameService.getState().activePlayer?.id).toBe(wrangler.id);
  });

  it("rolls with a standing Herder four squares away", async () => {
    const { declare } = match([{ playerIndex: 2, x: 6, y: 8 }], [OPPONENT]);
    const blockDice = await declare();
    expect(blockDice.pendingDecision?.type).toBe("block-dice");
  });
});

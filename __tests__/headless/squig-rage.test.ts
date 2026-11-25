import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";
import type { Scenario } from "../../src/types/Scenario";
import { GameEventNames } from "../../src/types/events";
import { SkillType, getSkill } from "../../src/types/Skills";
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
  const wrangler = fixtureValue(game.ctx.team1.players[1]);
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
      defenderId: fixtureValue(game.ctx.team2.players[0]).id,
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
    const [left, right] = game.ctx.team2.players.map((player) => player.id);
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
    expect((await game.execute({ type: "choose-bite-target" })).ok).toBe(false);
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
    const target = fixtureValue(game.ctx.team1.players[4]);
    const failed = await declare();
    expect(failed.pendingDecision).toMatchObject({
      type: "bite-target",
      purpose: "squig-knock-down",
      targetIds: [target.id],
    });
    expect(
      (await game.execute({ type: "choose-bite-target", playerId: target.id }))
        .ok
    ).toBe(true);
    expect(target.status).not.toBe(PlayerStatus.ACTIVE);
    expect(rolls.some((type) => type.includes("Armour"))).toBe(true);
    expect(game.ctx.gameService.getState().activePlayer).toMatchObject({
      id: wrangler.id,
      action: "ballAndChain",
    });
  });

  it("ends the activation with Distracted when there is nobody nearby", async () => {
    const { game, wrangler, declare } = match([], [{ ...OPPONENT, x: 13 }]);
    expect((await declare()).pendingDecision).toBeNull();
    expect(wrangler.conditions).toContainEqual({ type: "Distracted" });
    expect(game.ctx.gameService.hasPlayerActed(wrangler.id)).toBe(true);
  });

  it("drops a swing queued during the re-roll prompt when Rage ends the activation", async () => {
    const { game, wrangler, rolls, declare } = match([], [
      { ...OPPONENT, x: 13 },
    ]);
    game.ctx.team1.rerolls = 1;
    expect((await declare()).pendingDecision?.type).toBe("reroll");
    void game.ctx.gameService.ballAndChain(wrangler.id, 1, 0);
    await game.execute({ type: "use-reroll", accept: false });
    expect(wrangler.conditions).toContainEqual({ type: "Distracted" });
    expect(wrangler.gridPosition).toEqual({ x: 10, y: 5 });
    expect(rolls).not.toContain("Ball & Chain Deviation");
  });

  it("skips the roll with a standing Herder three squares away diagonally", async () => {
    const { game, rolls, wrangler, declare } = match(
      [{ playerIndex: 2, x: 7, y: 8 }],
      [OPPONENT]
    );
    expect((await declare()).pendingDecision).toBeNull();
    expect(rolls).toEqual([]);
    expect(game.ctx.gameService.getState().activePlayer?.id).toBe(wrangler.id);
  });

  it("rolls with a standing Herder four squares away", async () => {
    const { declare } = match([{ playerIndex: 2, x: 6, y: 8 }], [OPPONENT]);
    expect((await declare()).pendingDecision?.type).toBe("block-dice");
  });
});

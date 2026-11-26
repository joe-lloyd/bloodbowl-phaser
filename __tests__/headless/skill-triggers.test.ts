import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect, afterEach } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType, SkillCategory } from "../../src/types/Skills";
import { type Scenario } from "../../src/types/Scenario";
import { SkillRegistry, type SkillRule } from "../../src/game/skills";
import { GameOperation } from "../../src/game/core/GameOperation";

const give = (player: { skills: unknown[] }, type: SkillType) => {
  player.skills.push({
    type,
    category: SkillCategory.GENERAL,
    description: "",
  });
};

const scenario: Scenario = {
  id: "skill-triggers",
  name: "Skill triggers",
  description: "dodger marked by an opponent; attacker adjacent to defender",
  setup: {
    team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
    team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

const STUB_SKILL = SkillType.PREHENSILE_TAIL;

afterEach(() => {
  SkillRegistry.unregister(STUB_SKILL);
});

const run = async (withInertSkill: boolean) => {
  const game = new HeadlessGame({ scenario, seed: 3 });
  const dodger = game.ctx.team1.players[0];
  if (withInertSkill) {
    give(fixtureValue(game.ctx.team2.players[0]), SkillType.DIVING_TACKLE);
  }
  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(dodger).id,
    action: "move",
  });
  const moved = await game.execute({
    type: "move",
    playerId: fixtureValue(dodger).id,
    path: [{ x: 9, y: 4 }],
  });

  return JSON.stringify({
    dice: moved.events.filter((e) => e.name === GameEventNames.DiceRoll),
    dodger: fixtureValue(moved.snapshot.teams[0]).players[0],
  });
};

describe("reactive triggers — all-participant gather (3.1)", () => {
  it("an adjacent opponent's rule modifies the acting player's dodge roll", async () => {
    const stub: SkillRule = {
      onDodgeDeclared(ctx, self) {
        if (self.teamId === ctx.player.teamId) return;
        ctx.modifiers -= 2;
        ctx.triggers.push({
          playerId: self.id,
          skill: STUB_SKILL,
          effect: "worsens the dodge",
        });
      },
    };
    SkillRegistry.register(STUB_SKILL, stub);

    const game = new HeadlessGame({ scenario, seed: 3 });
    const dodger = game.ctx.team1.players[0];
    give(fixtureValue(game.ctx.team2.players[0]), STUB_SKILL);

    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(dodger).id,
      action: "move",
    });
    const moved = await game.execute({
      type: "move",
      playerId: fixtureValue(dodger).id,
      path: [{ x: 9, y: 4 }],
    });

    const skillEvents = moved.events.filter(
      (e) => e.name === GameEventNames.SkillTriggered
    );
    expect(skillEvents).toHaveLength(1);
    expect(
      z
        .object({ playerId: z.string() })
        .parse(fixtureValue(skillEvents[0]).data).playerId
    ).toBe(fixtureValue(game.ctx.team2.players[0]).id);

    const dodgeRoll = moved.events.find(
      (e) =>
        e.name === GameEventNames.DiceRoll &&
        z
          .object({ rollType: z.string() })
          .parse(e.data)
          .rollType.startsWith("Dodge")
    );
    expect(dodgeRoll).toBeDefined();
    const data = z
      .object({ value: z.number(), total: z.number() })
      .parse(fixtureValue(dodgeRoll).data);
    expect(data.total).toBe(data.value - 2);
  });

  it("a reactive-category skill with no rule is transparent", async () => {
    expect(await run(true)).toBe(await run(false));
  });
});

describe("flow-altering effects via the operation queue (3.3)", () => {
  it("a rule adds a step through the flow queue without editing the base rule", async () => {
    class ExtraStepOperation extends GameOperation {
      public readonly name = "ExtraStepOperation";
      execute(context: Parameters<GameOperation["execute"]>[0]): Promise<void> {
        context.eventBus.emit(GameEventNames.UI_Notification, "extra-step-ran");
        return Promise.resolve();
      }
    }
    const stub: SkillRule = {
      onBlockResult(ctx, self) {
        if (self.id !== ctx.attacker.id) return;
        ctx.flow?.add(new ExtraStepOperation());
        ctx.triggers.push({
          playerId: self.id,
          skill: STUB_SKILL,
          effect: "queues an extra step",
        });
      },
    };
    SkillRegistry.register(STUB_SKILL, stub);

    const game = new HeadlessGame({ scenario, seed: 5 });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    give(fixtureValue(attacker), STUB_SKILL);

    const notifications: unknown[] = [];
    game.ctx.eventBus.on(GameEventNames.UI_Notification, (d) => {
      notifications.push(d);
    });
    const skillEvents: unknown[] = [];
    game.ctx.eventBus.on(GameEventNames.SkillTriggered, (d) => {
      skillEvents.push(d);
    });

    await game.ctx.gameService.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(defender).id,
      {
        type: "both-down",
        icon: "",
        label: "Both Down",
      }
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(fixtureValue(attacker).status).toBe(PlayerStatus.PRONE);
    expect(fixtureValue(defender).status).toBe(PlayerStatus.STUNNED);

    expect(notifications).toContain("extra-step-ran");
    expect(skillEvents).toHaveLength(1);
  });
});

describe("Wrestle (5.2) — both prone without armour, a coach decision", () => {
  const bothDown = { type: "both-down" as const, icon: "", label: "Both Down" };

  it("accepting places both prone with no armour rolls and no turnover", async () => {
    const game = new HeadlessGame({ scenario, seed: 5 });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    give(fixtureValue(defender), SkillType.WRESTLE);
    give(fixtureValue(attacker), SkillType.BLOCK);

    const resolveDone = game.ctx.gameService.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(defender).id,
      bothDown
    );
    await new Promise((resolve) => setImmediate(resolve));

    const pending = game.pendingDecision();
    expect(pending?.type).toBe("reaction");
    if (pending?.type !== "reaction") return;
    expect(pending.chooserTeamId).toBe(game.ctx.team2.id);
    expect(pending.skill).toBe(SkillType.WRESTLE);

    const armour: unknown[] = [];
    game.ctx.eventBus.on(GameEventNames.DiceRoll, (d) => {
      if (d.rollType.includes("Armour")) armour.push(d);
    });
    const turnovers: unknown[] = [];
    game.ctx.eventBus.on(GameEventNames.Turnover, (d) => {
      turnovers.push(d);
    });

    const reply = await game.execute({ type: "use-reaction", accept: true });
    expect(reply.ok).toBe(true);
    await resolveDone;

    expect(fixtureValue(attacker).status).toBe(PlayerStatus.PRONE);
    expect(fixtureValue(defender).status).toBe(PlayerStatus.PRONE);
    expect(armour).toHaveLength(0);
    expect(turnovers).toHaveLength(0);
  });

  it("drops the ball when a Block-skilled carrier is Wrestled Prone", async () => {
    const game = new HeadlessGame({ scenario, seed: 5 });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    give(fixtureValue(attacker), SkillType.WRESTLE);
    give(fixtureValue(defender), SkillType.BLOCK);
    const square = { ...fixtureValue(fixtureValue(defender).gridPosition) };
    game.ctx.gameService.setBallPosition(square.x, square.y);

    const resolveDone = game.ctx.gameService.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(defender).id,
      bothDown
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(game.pendingDecision()).toMatchObject({
      type: "reaction",
      skill: SkillType.WRESTLE,
    });
    await game.execute({ type: "use-reaction", accept: true });
    await resolveDone;

    expect(fixtureValue(defender).status).toBe(PlayerStatus.PRONE);
    expect(game.ctx.gameService.getState().ballPosition).not.toEqual(square);
  });

  it.each([
    [[SkillType.WRESTLE, SkillType.JUGGERNAUT]],
    [[SkillType.JUGGERNAUT, SkillType.WRESTLE]],
  ])("lets a Juggernaut blitzer Wrestle (%j)", async (skills) => {
    const game = new HeadlessGame({ scenario, seed: 5 });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    for (const skill of skills) give(fixtureValue(attacker), skill);
    const declared = await game.execute({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "blitz",
    });
    expect(declared.ok).toBe(true);

    const resolveDone = game.ctx.gameService.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(defender).id,
      bothDown
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(game.pendingDecision()).toMatchObject({
      type: "reaction",
      skill: SkillType.WRESTLE,
      chooserTeamId: game.ctx.team1.id,
    });
    await game.execute({ type: "use-reaction", accept: true });
    await resolveDone;

    expect(fixtureValue(attacker).status).toBe(PlayerStatus.PRONE);
    expect(fixtureValue(defender).status).toBe(PlayerStatus.PRONE);
  });

  it("declining applies the normal Both Down", async () => {
    const game = new HeadlessGame({ scenario, seed: 5 });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    give(fixtureValue(defender), SkillType.WRESTLE);

    const resolveDone = game.ctx.gameService.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(defender).id,
      bothDown
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(game.pendingDecision()?.type).toBe("reaction");

    await game.execute({ type: "use-reaction", accept: false });
    await resolveDone;

    expect(fixtureValue(attacker).status).toBe(PlayerStatus.PRONE);
    expect(fixtureValue(defender).status).toBe(PlayerStatus.STUNNED);
  });
});

describe("Dodge vs Defender Stumbles (5.3) and Tackle", () => {
  const stumbles = {
    type: "pow-dodge" as const,
    icon: "",
    label: "Defender Stumbles",
  };

  async function resolveStumbles(withTackle: boolean) {
    const game = new HeadlessGame({ scenario, seed: 5 });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    give(fixtureValue(defender), SkillType.DODGE);
    if (withTackle) give(fixtureValue(attacker), SkillType.TACKLE);

    const done = game.ctx.gameService.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(defender).id,
      stumbles
    );
    await new Promise((resolve) => setImmediate(resolve));

    const push = await game.execute({
      type: "choose-push-direction",
      x: 12,
      y: 5,
    });
    expect(push.ok).toBe(true);
    await done;
    return { game, defender };
  }

  it("a defender with Dodge is pushed but not knocked down", async () => {
    const { defender } = await resolveStumbles(false);
    expect(fixtureValue(defender).gridPosition).toEqual({ x: 12, y: 5 });
    expect(fixtureValue(defender).status).toBe(PlayerStatus.ACTIVE);
  });

  it("Tackle cancels the Dodge conversion — defender goes down", async () => {
    const { defender } = await resolveStumbles(true);
    expect(fixtureValue(defender).gridPosition).toEqual({ x: 12, y: 5 });

    expect(fixtureValue(defender).status).not.toBe(PlayerStatus.ACTIVE);
  });
});

describe("Stand Firm (5.7) — reacting-team push refusal", () => {
  const push = { type: "push" as const, icon: "", label: "Push" };

  it("accepting keeps the pushed player in place; the reacting team decides", async () => {
    const game = new HeadlessGame({ scenario, seed: 5 });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    give(fixtureValue(defender), SkillType.STAND_FIRM);

    const done = game.ctx.gameService.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(defender).id,
      push
    );
    await new Promise((resolve) => setImmediate(resolve));

    const pending = game.pendingDecision();
    expect(pending?.type).toBe("reaction");
    if (pending?.type !== "reaction") return;
    expect(pending.chooserTeamId).toBe(game.ctx.team2.id);
    expect(pending.skill).toBe(SkillType.STAND_FIRM);

    const reply = await game.execute({ type: "use-reaction", accept: true });
    expect(reply.ok).toBe(true);
    await done;

    expect(fixtureValue(defender).gridPosition).toEqual({ x: 11, y: 5 });
    expect(fixtureValue(defender).status).toBe(PlayerStatus.ACTIVE);
    expect(
      reply.events.some((e) => e.name === GameEventNames.SkillTriggered)
    ).toBe(true);
  });

  it("declining lets the push proceed normally", async () => {
    const game = new HeadlessGame({ scenario, seed: 5 });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    give(fixtureValue(defender), SkillType.STAND_FIRM);

    const done = game.ctx.gameService.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(defender).id,
      push
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(game.pendingDecision()?.type).toBe("reaction");

    const declined = await game.execute({
      type: "use-reaction",
      accept: false,
    });
    expect(declined.ok).toBe(true);

    expect(declined.pendingDecision?.type).toBe("push-direction");

    await game.execute({ type: "choose-push-direction", x: 12, y: 5 });
    await done;
    expect(fixtureValue(defender).gridPosition).toEqual({ x: 12, y: 5 });
  });
});

import { describe, it, expect, afterEach } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType, SkillCategory } from "../../src/types/Skills";
import { Scenario } from "../../src/types/Scenario";
import { SkillRegistry, SkillRule } from "../../src/game/skills";
import { GameOperation } from "../../src/game/core/GameOperation";

/**
 * Reactive/interrupt trigger framework: all-participant gather, reactions
 * as reacting-team decisions, flow-altering effects via the operation
 * queue. Stub rules are registered on skills with no built-in rule and
 * removed after each test.
 */

const give = (player: { skills: unknown[] }, type: SkillType) =>
  player.skills.push({ type, category: SkillCategory.GENERAL, description: "" });

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

const STUB_SKILL = SkillType.PREHENSILE_TAIL; // no built-in rule

afterEach(() => {
  SkillRegistry.unregister(STUB_SKILL);
});

describe("reactive triggers — all-participant gather (3.1)", () => {
  it("an adjacent opponent's rule modifies the acting player's dodge roll", async () => {
    // Stub: the marker worsens any dodge away from it by 2 (Prehensile
    // Tail's real behavior, registered here as a stub)
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
    give(game.ctx.team2.players[0], STUB_SKILL);

    await game.execute({
      type: "declare-action",
      playerId: dodger.id,
      action: "move",
    });
    const moved = await game.execute({
      type: "move",
      playerId: dodger.id,
      path: [{ x: 9, y: 4 }], // leaves the opponent's tackle zone
    });

    const skillEvents = moved.events.filter(
      (e) => e.name === GameEventNames.SkillTriggered
    );
    expect(skillEvents).toHaveLength(1);
    expect(
      (skillEvents[0].data as { playerId: string }).playerId
    ).toBe(game.ctx.team2.players[0].id);

    // The dodge dice event carries the worsened modifier: total = roll - 2
    // (the target square is free of markers, so the base modifier is 0)
    const dodgeRoll = moved.events.find(
      (e) =>
        e.name === GameEventNames.DiceRoll &&
        (e.data as { rollType: string }).rollType.startsWith("Dodge")
    );
    expect(dodgeRoll).toBeDefined();
    const data = dodgeRoll!.data as { value: number; total: number };
    expect(data.total).toBe(data.value - 2);
  });

  it("a reactive-category skill with no rule is transparent", async () => {
    const run = async (withInertSkill: boolean) => {
      const game = new HeadlessGame({ scenario, seed: 3 });
      const dodger = game.ctx.team1.players[0];
      if (withInertSkill) {
        give(game.ctx.team2.players[0], SkillType.DIVING_TACKLE); // no rule
      }
      await game.execute({
        type: "declare-action",
        playerId: dodger.id,
        action: "move",
      });
      const moved = await game.execute({
        type: "move",
        playerId: dodger.id,
        path: [{ x: 9, y: 4 }],
      });
      // Compare outcomes, not the roster (the skill itself serializes)
      return JSON.stringify({
        dice: moved.events.filter((e) => e.name === GameEventNames.DiceRoll),
        dodger: moved.snapshot.teams[0].players[0],
      });
    };
    expect(await run(true)).toBe(await run(false));
  });
});

describe("flow-altering effects via the operation queue (3.3)", () => {
  it("a rule adds a step through the flow queue without editing the base rule", async () => {
    class ExtraStepOperation extends GameOperation {
      public readonly name = "ExtraStepOperation";
      async execute(context: {
        eventBus: { emit: (n: string, d: unknown) => void };
      }): Promise<void> {
        context.eventBus.emit(GameEventNames.UI_Notification, "extra-step-ran");
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
    give(attacker, STUB_SKILL);

    const notifications: unknown[] = [];
    game.ctx.eventBus.on(GameEventNames.UI_Notification, (d) =>
      notifications.push(d)
    );
    const skillEvents: unknown[] = [];
    game.ctx.eventBus.on(GameEventNames.SkillTriggered, (d) =>
      skillEvents.push(d)
    );

    await game.ctx.gameService.resolveBlock(attacker.id, defender.id, {
      type: "both-down",
      icon: "",
      label: "Both Down",
    });
    await new Promise((resolve) => setImmediate(resolve));

    // The base both-down outcome is unchanged...
    expect(attacker.status).toBe(PlayerStatus.PRONE);
    expect(defender.status).toBe(PlayerStatus.PRONE);
    // ...and the extra step ran via the queue, announced as a trigger
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
    give(defender, SkillType.WRESTLE);
    give(attacker, SkillType.BLOCK); // Wrestle overrides Block

    const resolveDone = game.ctx.gameService.resolveBlock(
      attacker.id,
      defender.id,
      bothDown
    );
    await new Promise((resolve) => setImmediate(resolve));

    // The engine paused on the DEFENDER's reaction decision
    const pending = game.pendingDecision();
    expect(pending?.type).toBe("reaction");
    if (pending?.type !== "reaction") return;
    expect(pending.chooserTeamId).toBe(game.ctx.team2.id);
    expect(pending.skill).toBe(SkillType.WRESTLE);

    const armour: unknown[] = [];
    game.ctx.eventBus.on(GameEventNames.DiceRoll, (d) => {
      if ((d as { rollType: string }).rollType.includes("Armour"))
        armour.push(d);
    });
    const turnovers: unknown[] = [];
    game.ctx.eventBus.on(GameEventNames.Turnover, (d) => turnovers.push(d));

    const reply = await game.execute({ type: "use-reaction", accept: true });
    expect(reply.ok).toBe(true);
    await resolveDone;

    // Both prone — "regardless of any other Skills" (Block did not save
    // the attacker); no armour rolls; no turnover (attacker had no ball)
    expect(attacker.status).toBe(PlayerStatus.PRONE);
    expect(defender.status).toBe(PlayerStatus.PRONE);
    expect(armour).toHaveLength(0);
    expect(turnovers).toHaveLength(0);
  });

  it("declining applies the normal Both Down", async () => {
    const game = new HeadlessGame({ scenario, seed: 5 });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    give(defender, SkillType.WRESTLE);

    const resolveDone = game.ctx.gameService.resolveBlock(
      attacker.id,
      defender.id,
      bothDown
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(game.pendingDecision()?.type).toBe("reaction");

    await game.execute({ type: "use-reaction", accept: false });
    await resolveDone;

    expect(attacker.status).toBe(PlayerStatus.PRONE);
    expect(defender.status).toBe(PlayerStatus.PRONE);
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
    give(defender, SkillType.DODGE);
    if (withTackle) give(attacker, SkillType.TACKLE);

    const done = game.ctx.gameService.resolveBlock(
      attacker.id,
      defender.id,
      stumbles
    );
    await new Promise((resolve) => setImmediate(resolve));
    // The push flow now waits on the push-direction decision
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
    expect(defender.gridPosition).toEqual({ x: 12, y: 5 });
    expect(defender.status).toBe(PlayerStatus.ACTIVE); // stumble → push
  });

  it("Tackle cancels the Dodge conversion — defender goes down", async () => {
    const { defender } = await resolveStumbles(true);
    expect(defender.gridPosition).toEqual({ x: 12, y: 5 });
    // Knocked down (armour/injury may escalate prone to stunned/KO)
    expect(defender.status).not.toBe(PlayerStatus.ACTIVE);
  });
});

describe("Stand Firm (5.7) — reacting-team push refusal", () => {
  const push = { type: "push" as const, icon: "", label: "Push" };

  it("accepting keeps the pushed player in place; the reacting team decides", async () => {
    const game = new HeadlessGame({ scenario, seed: 5 });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    give(defender, SkillType.STAND_FIRM);

    const done = game.ctx.gameService.resolveBlock(
      attacker.id,
      defender.id,
      push
    );
    await new Promise((resolve) => setImmediate(resolve));

    const pending = game.pendingDecision();
    expect(pending?.type).toBe("reaction");
    if (pending?.type !== "reaction") return;
    expect(pending.chooserTeamId).toBe(game.ctx.team2.id); // reacting team
    expect(pending.skill).toBe(SkillType.STAND_FIRM);

    const reply = await game.execute({ type: "use-reaction", accept: true });
    expect(reply.ok).toBe(true);
    await done;

    expect(defender.gridPosition).toEqual({ x: 11, y: 5 }); // unmoved
    expect(defender.status).toBe(PlayerStatus.ACTIVE);
    expect(
      reply.events.some((e) => e.name === GameEventNames.SkillTriggered)
    ).toBe(true);
  });

  it("declining lets the push proceed normally", async () => {
    const game = new HeadlessGame({ scenario, seed: 5 });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    give(defender, SkillType.STAND_FIRM);

    const done = game.ctx.gameService.resolveBlock(
      attacker.id,
      defender.id,
      push
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(game.pendingDecision()?.type).toBe("reaction");

    const declined = await game.execute({
      type: "use-reaction",
      accept: false,
    });
    expect(declined.ok).toBe(true);
    // Push flow resumes: now the attacker picks the push direction
    expect(declined.pendingDecision?.type).toBe("push-direction");

    await game.execute({ type: "choose-push-direction", x: 12, y: 5 });
    await done;
    expect(defender.gridPosition).toEqual({ x: 12, y: 5 });
  });
});

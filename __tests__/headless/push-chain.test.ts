import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { type Scenario } from "../../src/types/Scenario";
import { SCENARIOS } from "../../src/data/scenarios";
import {
  type CommandResponse,
  type PendingDecision,
} from "../../src/headless/protocol";

const chainScenario = fixtureValue(
  SCENARIOS.find((s) => s.id === "chain-push")
);
const surfScenario = fixtureValue(SCENARIOS.find((s) => s.id === "crowd-surf"));
const grabOpenScenario = fixtureValue(
  SCENARIOS.find((s) => s.id === "chain-push-grab-open")
);
const grabBoxedScenario = fixtureValue(
  SCENARIOS.find((s) => s.id === "chain-push-grab-boxed")
);
const grabSecondLinkScenario = fixtureValue(
  SCENARIOS.find((s) => s.id === "chain-push-grab-second-link")
);

const chainIntoCrowdScenario: Scenario = {
  id: "chain-into-crowd",
  name: "Chain into crowd",
  description: "chained active-team player surfs -> turnover",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 10, y: 2 },
      { playerIndex: 1, x: 10, y: 0 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 10, y: 1 },
      { playerIndex: 1, x: 9, y: 0 },
      { playerIndex: 2, x: 11, y: 0 },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
  },
};

async function blockUntilPush(
  game: HeadlessGame,
  attackerId: string,
  defenderId: string
): Promise<CommandResponse | null> {
  await game.execute({
    type: "declare-action",
    playerId: attackerId,
    action: "block",
  });
  const rolled = await game.execute({ type: "block", attackerId, defenderId });
  const pending = rolled.pendingDecision;
  if (pending?.type !== "block-dice") return null;
  const pushIndex = pending.options.findIndex((o) => o.type === "push");
  if (pushIndex === -1) return null;
  return game.execute({ type: "choose-block-result", index: pushIndex });
}

function expectPushDecision(
  pending: PendingDecision | null
): Extract<PendingDecision, { type: "push-direction" }> {
  expect(pending?.type).toBe("push-direction");
  if (pending?.type !== "push-direction")
    throw new Error("Expected push direction");
  return pending;
}

describe("chain pushes", () => {
  it("resolves a two-link chain with every direction chosen by the blocker", async () => {
    for (let seed = 1; seed <= 100; seed++) {
      const game = new HeadlessGame({ scenario: chainScenario, seed });
      const snap = game.snapshot();
      const attacker = fixtureValue(snap.teams[0]).players[0];
      const defender = fixtureValue(snap.teams[1]).players[0];
      const middleMan = fixtureValue(snap.teams[1]).players[2];

      const pushed = await blockUntilPush(
        game,
        fixtureValue(attacker).id,
        fixtureValue(defender).id
      );
      if (!pushed) continue;

      const first = expectPushDecision(pushed.pendingDecision);
      expect(first.defenderId).toBe(fixtureValue(defender).id);
      expect(first.attackerId).toBe(fixtureValue(attacker).id);
      expect(first.options).toEqual(
        expect.arrayContaining([
          { x: 11, y: 4 },
          { x: 11, y: 5 },
          { x: 11, y: 6 },
        ])
      );

      const gated = await game.execute({ type: "end-turn" });
      expect(gated.ok).toBe(false);
      expect(gated.reason).toContain("decision-pending:push-direction");

      const chained = await game.execute({
        type: "choose-push-direction",
        x: 11,
        y: 5,
      });
      const second = expectPushDecision(chained.pendingDecision);
      expect(second.defenderId).toBe(fixtureValue(middleMan).id);
      expect(second.attackerId).toBe(fixtureValue(attacker).id);
      expect(second.options).toEqual(
        expect.arrayContaining([
          { x: 12, y: 4 },
          { x: 12, y: 5 },
          { x: 12, y: 6 },
        ])
      );

      const resolved = await game.execute({
        type: "choose-push-direction",
        x: 12,
        y: 5,
      });
      const moves = resolved.events.filter(
        (e) => e.name === GameEventNames.PlayerMoved
      );
      expect(
        moves.map(
          (e) => z.object({ playerId: z.string() }).parse(e.data).playerId
        )
      ).toEqual([fixtureValue(middleMan).id, fixtureValue(defender).id]);

      const after = resolved.snapshot;
      const find = (id: string) =>
        fixtureValue(
          after.teams.flatMap((t) => t.players).find((p) => p.id === id)
        ).position;
      expect(find(fixtureValue(defender).id)).toEqual({ x: 11, y: 5 });
      expect(find(fixtureValue(middleMan).id)).toEqual({ x: 12, y: 5 });

      expect(resolved.pendingDecision?.type).toBe("follow-up");
      const done = await game.execute({
        type: "choose-follow-up",
        followUp: true,
      });
      expect(done.ok).toBe(true);
      expect(find(fixtureValue(attacker).id)).toEqual({ x: 9, y: 5 });
      const final = game.snapshot();
      const attackerAfter = fixtureValue(
        fixtureValue(final.teams[0]).players.find(
          (p) => p.id === fixtureValue(attacker).id
        )
      );
      expect(attackerAfter.position).toEqual({ x: 10, y: 5 });
      return;
    }
    throw new Error("no push result found in seed range");
  });
});

describe("crowd surf", () => {
  it("surfs the carrier: injury with no armour roll, throw-in, ball back on pitch", async () => {
    let surfsTested = 0;
    let stunnedToReserves = 0;

    for (let seed = 1; seed <= 300 && surfsTested < 5; seed++) {
      const game = new HeadlessGame({ scenario: surfScenario, seed });
      const snap = game.snapshot();
      const attacker = fixtureValue(snap.teams[0]).players[0];
      const carrier = fixtureValue(snap.teams[1]).players[0];

      const pushed = await blockUntilPush(
        game,
        fixtureValue(attacker).id,
        fixtureValue(carrier).id
      );
      if (!pushed) continue;
      surfsTested++;

      const decision = expectPushDecision(pushed.pendingDecision);
      expect(decision.options).toEqual([{ x: 11, y: -1 }]);

      const surfed = await game.execute({
        type: "choose-push-direction",
        x: 11,
        y: -1,
      });
      expect(surfed.ok).toBe(true);

      const names = surfed.events.map((e) => e.name);
      expect(names).toContain(GameEventNames.PlayerPushedIntoCrowd);
      expect(names).toContain(GameEventNames.BallThrownIn);

      const rolls = surfed.events
        .filter((e) => e.name === GameEventNames.DiceRoll)
        .map((e) => z.object({ rollType: z.string() }).parse(e.data).rollType);
      expect(rolls.some((r) => r.includes("Injury by the Crowd"))).toBe(true);
      expect(rolls.some((r) => r.includes("Armour"))).toBe(false);

      const carrierAfter = fixtureValue(
        fixtureValue(surfed.snapshot.teams[1]).players.find(
          (p) => p.id === fixtureValue(carrier).id
        )
      );
      expect(carrierAfter.position).toBeNull();
      expect([
        PlayerStatus.RESERVE,
        PlayerStatus.KO,
        PlayerStatus.INJURED,
      ]).toContain(carrierAfter.status);
      if (carrierAfter.status === PlayerStatus.RESERVE) stunnedToReserves++;

      const ball = fixtureValue(surfed.snapshot.ballPosition);
      expect(ball).not.toBeNull();
      expect(ball.x).toBeGreaterThanOrEqual(0);
      expect(ball.x).toBeLessThanOrEqual(25);
      expect(ball.y).toBeGreaterThanOrEqual(0);
      expect(ball.y).toBeLessThanOrEqual(14);

      expect(names).not.toContain(GameEventNames.Turnover);

      expect(names).not.toContain(GameEventNames.TurnStarted);
      expect(surfed.pendingDecision).toEqual({
        type: "follow-up",
        attackerId: fixtureValue(attacker).id,
        targetSquare: { x: 10, y: 0 },
      });
      expect(surfed.snapshot.activeTeamId).toBe(fixtureValue(snap.teams[0]).id);

      const followed = await game.execute({
        type: "choose-follow-up",
        followUp: true,
      });
      expect(followed.ok).toBe(true);
      const attackerAfter = fixtureValue(
        fixtureValue(followed.snapshot.teams[0]).players.find(
          (p) => p.id === fixtureValue(attacker).id
        )
      );
      expect(attackerAfter.position).toEqual({ x: 10, y: 0 });

      expect(followed.events.map((e) => e.name)).toContain(
        GameEventNames.TurnStarted
      );
      expect(followed.snapshot.activeTeamId).toBe(
        fixtureValue(snap.teams[1]).id
      );
    }

    expect(surfsTested).toBeGreaterThanOrEqual(5);

    expect(stunnedToReserves).toBeGreaterThanOrEqual(1);
  });

  it("chain-pushing your own player into the crowd is exactly one turnover", async () => {
    for (let seed = 1; seed <= 200; seed++) {
      const game = new HeadlessGame({
        scenario: chainIntoCrowdScenario,
        seed,
      });
      const snap = game.snapshot();
      const attacker = fixtureValue(snap.teams[0]).players[0];
      const teammate = fixtureValue(snap.teams[0]).players[1];
      const defender = fixtureValue(snap.teams[1]).players[0];

      const pushed = await blockUntilPush(
        game,
        fixtureValue(attacker).id,
        fixtureValue(defender).id
      );
      if (!pushed) continue;

      const first = expectPushDecision(pushed.pendingDecision);
      expect(first.options).toEqual(
        expect.arrayContaining([
          { x: 10, y: 0 },
          { x: 9, y: 0 },
          { x: 11, y: 0 },
        ])
      );

      const chained = await game.execute({
        type: "choose-push-direction",
        x: 10,
        y: 0,
      });
      const second = expectPushDecision(chained.pendingDecision);
      expect(second.defenderId).toBe(fixtureValue(teammate).id);

      second.options.forEach((o) => {
        expect(o.y).toBe(-1);
      });

      const surfed = await game.execute({
        type: "choose-push-direction",
        x: fixtureValue(second.options[0]).x,
        y: fixtureValue(second.options[0]).y,
      });
      expect(surfed.ok).toBe(true);

      let events = [...surfed.events];
      if (surfed.pendingDecision?.type === "follow-up") {
        const followed = await game.execute({
          type: "choose-follow-up",
          followUp: false,
        });
        events = events.concat(followed.events);
      }

      const names = events.map((e) => e.name);
      expect(names).toContain(GameEventNames.PlayerPushedIntoCrowd);
      expect(names.filter((n) => n === GameEventNames.Turnover)).toHaveLength(
        1
      );
      expect(
        names.filter((n) => n === GameEventNames.TurnStarted)
      ).toHaveLength(1);

      const after = game.snapshot();
      expect(after.activeTeamId).toBe(fixtureValue(snap.teams[1]).id);
      const teammateAfter = fixtureValue(
        fixtureValue(after.teams[0]).players.find(
          (p) => p.id === fixtureValue(teammate).id
        )
      );
      expect(teammateAfter.position).toBeNull();
      const defenderAfter = fixtureValue(
        fixtureValue(after.teams[1]).players.find(
          (p) => p.id === fixtureValue(defender).id
        )
      );
      expect(defenderAfter.position).toEqual({ x: 10, y: 0 });
      return;
    }
    throw new Error("no push result found in seed range");
  });
});

describe("Grab-assisted push", () => {
  it("chain-push-grab-open: Grab offers the wider square as an open-tier choice", async () => {
    for (let seed = 1; seed <= 100; seed++) {
      const game = new HeadlessGame({ scenario: grabOpenScenario, seed });
      const snap = game.snapshot();
      const attacker = fixtureValue(snap.teams[0]).players[0];
      const defender = fixtureValue(snap.teams[1]).players[0];

      const pushed = await blockUntilPush(
        game,
        fixtureValue(attacker).id,
        fixtureValue(defender).id
      );
      if (!pushed) continue;

      const decision = expectPushDecision(pushed.pendingDecision);
      expect(decision.options).toEqual([{ x: 10, y: 4 }]);

      const raw = pushed.events.find(
        (e) => e.name === GameEventNames.UI_SelectPushDirection
      );
      expect(
        z
          .union([
            z.object({ pushTier: z.string().exactOptional() }),
            z.undefined(),
          ])
          .parse(raw?.data)?.pushTier
      ).toBe("open");
      return;
    }
    throw new Error("no push result found in seed range");
  });

  it("chain-push-grab-boxed: a fully boxed-in defender still chains over the normal three squares", async () => {
    for (let seed = 1; seed <= 100; seed++) {
      const game = new HeadlessGame({ scenario: grabBoxedScenario, seed });
      const snap = game.snapshot();
      const attacker = fixtureValue(snap.teams[0]).players[0];
      const defender = fixtureValue(snap.teams[1]).players[0];

      const pushed = await blockUntilPush(
        game,
        fixtureValue(attacker).id,
        fixtureValue(defender).id
      );
      if (!pushed) continue;

      const decision = expectPushDecision(pushed.pendingDecision);
      expect(decision.options).toEqual(
        expect.arrayContaining([
          { x: 11, y: 4 },
          { x: 11, y: 5 },
          { x: 11, y: 6 },
        ])
      );
      expect(decision.options).toHaveLength(3);

      const raw = pushed.events.find(
        (e) => e.name === GameEventNames.UI_SelectPushDirection
      );
      expect(
        z
          .union([
            z.object({ pushTier: z.string().exactOptional() }),
            z.undefined(),
          ])
          .parse(raw?.data)?.pushTier
      ).toBe("chain");
      return;
    }
    throw new Error("no push result found in seed range");
  });

  it("chain-push-grab-second-link: a forced second push in the chain ignores Grab", async () => {
    for (let seed = 1; seed <= 100; seed++) {
      const game = new HeadlessGame({
        scenario: grabSecondLinkScenario,
        seed,
      });
      const snap = game.snapshot();
      const attacker = fixtureValue(snap.teams[0]).players[0];
      const defender = fixtureValue(snap.teams[1]).players[0];
      const secondOccupant = fixtureValue(snap.teams[1]).players[2];

      const pushed = await blockUntilPush(
        game,
        fixtureValue(attacker).id,
        fixtureValue(defender).id
      );
      if (!pushed) continue;

      const first = expectPushDecision(pushed.pendingDecision);
      expect(first.options).toEqual(
        expect.arrayContaining([
          { x: 11, y: 4 },
          { x: 11, y: 5 },
          { x: 11, y: 6 },
        ])
      );
      expect(first.options).toHaveLength(3);
      const firstRaw = pushed.events.find(
        (e) => e.name === GameEventNames.UI_SelectPushDirection
      );
      expect(
        z
          .union([
            z.object({ pushTier: z.string().exactOptional() }),
            z.undefined(),
          ])
          .parse(firstRaw?.data)?.pushTier
      ).toBe("chain");

      const chained = await game.execute({
        type: "choose-push-direction",
        x: 11,
        y: 4,
      });
      const second = expectPushDecision(chained.pendingDecision);
      expect(second.defenderId).toBe(fixtureValue(secondOccupant).id);
      expect(second.attackerId).toBe(fixtureValue(attacker).id);
      expect(second.options).toEqual(
        expect.arrayContaining([
          { x: 12, y: 3 },
          { x: 12, y: 4 },
          { x: 11, y: 3 },
        ])
      );
      expect(second.options).toHaveLength(3);

      const secondRaw = chained.events.find(
        (e) => e.name === GameEventNames.UI_SelectPushDirection
      );
      expect(
        z
          .union([
            z.object({ pushTier: z.string().exactOptional() }),
            z.undefined(),
          ])
          .parse(secondRaw?.data)?.pushTier
      ).toBe("chain");
      return;
    }
    throw new Error("no push result found in seed range");
  });

  it("names Grab in the match log when the wider square set is offered", async () => {
    for (let seed = 1; seed <= 100; seed++) {
      const game = new HeadlessGame({ scenario: grabOpenScenario, seed });
      const snap = game.snapshot();
      const attacker = fixtureValue(snap.teams[0]).players[0];
      const defender = fixtureValue(snap.teams[1]).players[0];

      const pushed = await blockUntilPush(
        game,
        fixtureValue(attacker).id,
        fixtureValue(defender).id
      );
      if (!pushed) continue;

      const grabLogEntry = pushed.events.find(
        (e) =>
          e.name === GameEventNames.SkillTriggered &&
          z.object({ skill: z.string().exactOptional() }).parse(e.data)
            .skill === SkillType.GRAB &&
          z
            .object({ effect: z.string().exactOptional() })
            .parse(e.data)
            .effect?.toLowerCase()
            .includes("usual three")
      );
      expect(grabLogEntry).toBeDefined();
      return;
    }
    throw new Error("no push result found in seed range");
  });
});

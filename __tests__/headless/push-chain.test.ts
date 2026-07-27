import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { Scenario } from "../../src/types/Scenario";
import { SCENARIOS } from "../../src/data/scenarios";
import { CommandResponse, PendingDecision } from "../../src/headless/protocol";

const chainScenario = SCENARIOS.find((s) => s.id === "chain-push")!;
const surfScenario = SCENARIOS.find((s) => s.id === "crowd-surf")!;
const grabOpenScenario = SCENARIOS.find(
  (s) => s.id === "chain-push-grab-open"
)!;
const grabBoxedScenario = SCENARIOS.find(
  (s) => s.id === "chain-push-grab-boxed"
)!;
const grabSecondLinkScenario = SCENARIOS.find(
  (s) => s.id === "chain-push-grab-second-link"
)!;

/**
 * Chain push of the blocker's own teammate into the crowd: the defender's
 * only push squares are occupied (no sideline exit for THEM), and the
 * chained teammate at the sideline has nowhere on-pitch to go.
 */
const chainIntoCrowdScenario: Scenario = {
  id: "chain-into-crowd",
  name: "Chain into crowd",
  description: "chained active-team player surfs -> turnover",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 10, y: 2 }, // attacker, pushing "up" the pitch
      { playerIndex: 1, x: 10, y: 0 }, // teammate who will be chained off
    ],
    team2Placements: [
      { playerIndex: 0, x: 10, y: 1 }, // defender
      { playerIndex: 1, x: 9, y: 0 }, // fills the defender's other squares
      { playerIndex: 2, x: 11, y: 0 },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
  },
};

/**
 * Run declare-block + block for the given seed and pick the "push" die if
 * offered. Returns null when the seed didn't roll a plain push.
 */
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
  if (!pending || pending.type !== "block-dice") return null;
  const pushIndex = pending.options.findIndex((o) => o.type === "push");
  if (pushIndex === -1) return null;
  return game.execute({ type: "choose-block-result", index: pushIndex });
}

function expectPushDecision(
  pending: PendingDecision | null
): Extract<PendingDecision, { type: "push-direction" }> {
  expect(pending?.type).toBe("push-direction");
  return pending as Extract<PendingDecision, { type: "push-direction" }>;
}

describe("chain pushes", () => {
  it("resolves a two-link chain with every direction chosen by the blocker", async () => {
    for (let seed = 1; seed <= 100; seed++) {
      const game = new HeadlessGame({ scenario: chainScenario, seed });
      const snap = game.snapshot();
      const attacker = snap.teams[0].players[0]; // (9,5)
      const defender = snap.teams[1].players[0]; // (10,5)
      const middleMan = snap.teams[1].players[2]; // (11,5)

      const pushed = await blockUntilPush(game, attacker.id, defender.id);
      if (!pushed) continue;

      // All three push squares are occupied: the chain tier offers exactly
      // those squares, attributed to the blocker
      const first = expectPushDecision(pushed.pendingDecision);
      expect(first.defenderId).toBe(defender.id);
      expect(first.attackerId).toBe(attacker.id);
      expect(first.options).toEqual(
        expect.arrayContaining([
          { x: 11, y: 4 },
          { x: 11, y: 5 },
          { x: 11, y: 6 },
        ])
      );

      // While the decision is open, other commands are gated
      const gated = await game.execute({ type: "end-turn" });
      expect(gated.ok).toBe(false);
      expect(gated.reason).toContain("decision-pending:push-direction");

      // Push the defender into the occupied middle square -> second link
      const chained = await game.execute({
        type: "choose-push-direction",
        x: 11,
        y: 5,
      });
      const second = expectPushDecision(chained.pendingDecision);
      expect(second.defenderId).toBe(middleMan.id);
      expect(second.attackerId).toBe(attacker.id); // still the blocker's call
      expect(second.options).toEqual(
        expect.arrayContaining([
          { x: 12, y: 4 },
          { x: 12, y: 5 },
          { x: 12, y: 6 },
        ])
      );

      // Resolve the chain: innermost player moves first, then the defender
      const resolved = await game.execute({
        type: "choose-push-direction",
        x: 12,
        y: 5,
      });
      const moves = resolved.events.filter(
        (e) => e.name === GameEventNames.PlayerMoved
      );
      expect(
        moves.map((e) => (e.data as { playerId: string }).playerId)
      ).toEqual([middleMan.id, defender.id]);

      const after = resolved.snapshot;
      const find = (id: string) =>
        after.teams
          .flatMap((t) => t.players)
          .find((p) => p.id === id)!.position;
      expect(find(defender.id)).toEqual({ x: 11, y: 5 });
      expect(find(middleMan.id)).toEqual({ x: 12, y: 5 });

      // Follow-up stays the last decision of the block
      expect(resolved.pendingDecision?.type).toBe("follow-up");
      const done = await game.execute({
        type: "choose-follow-up",
        followUp: true,
      });
      expect(done.ok).toBe(true);
      expect(find(attacker.id)).toEqual({ x: 9, y: 5 }); // pre-follow-up snapshot
      const final = game.snapshot();
      const attackerAfter = final.teams[0].players.find(
        (p) => p.id === attacker.id
      )!;
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
      const attacker = snap.teams[0].players[0]; // (9,0)
      const carrier = snap.teams[1].players[0]; // (10,0) holding the ball

      const pushed = await blockUntilPush(game, attacker.id, carrier.id);
      if (!pushed) continue;
      surfsTested++;

      // Sideline + occupied squares: the crowd exit is the only option
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

      // Injury by the crowd rolls no armour
      const rolls = surfed.events
        .filter((e) => e.name === GameEventNames.DiceRoll)
        .map((e) => (e.data as { rollType: string }).rollType);
      expect(rolls.some((r) => r.includes("Injury by the Crowd"))).toBe(true);
      expect(rolls.some((r) => r.includes("Armour"))).toBe(false);

      // The surfed player is off the pitch in a removed status
      const carrierAfter = surfed.snapshot.teams[1].players.find(
        (p) => p.id === carrier.id
      )!;
      expect(carrierAfter.position).toBeNull();
      expect([
        PlayerStatus.RESERVE, // Stunned by the crowd -> reserves box
        PlayerStatus.KO,
        PlayerStatus.INJURED,
      ]).toContain(carrierAfter.status);
      if (carrierAfter.status === PlayerStatus.RESERVE) stunnedToReserves++;

      // The throw-in left the ball somewhere on the pitch
      const ball = surfed.snapshot.ballPosition!;
      expect(ball).not.toBeNull();
      expect(ball.x).toBeGreaterThanOrEqual(0);
      expect(ball.x).toBeLessThanOrEqual(25);
      expect(ball.y).toBeGreaterThanOrEqual(0);
      expect(ball.y).toBeLessThanOrEqual(14);

      // Surfing an opponent is not a turnover
      expect(names).not.toContain(GameEventNames.Turnover);

      // The blocker is still offered the follow-up into the vacated
      // square — only AFTER the throw-in settled (ball at rest), and the
      // activation/turn must not end until the follow-up is answered
      expect(names).not.toContain(GameEventNames.TurnStarted);
      expect(surfed.pendingDecision).toEqual({
        type: "follow-up",
        attackerId: attacker.id,
        targetSquare: { x: 10, y: 0 },
      });
      expect(surfed.snapshot.activeTeamId).toBe(snap.teams[0].id);

      const followed = await game.execute({
        type: "choose-follow-up",
        followUp: true,
      });
      expect(followed.ok).toBe(true);
      const attackerAfter = followed.snapshot.teams[0].players.find(
        (p) => p.id === attacker.id
      )!;
      expect(attackerAfter.position).toEqual({ x: 10, y: 0 });
      // The attacker was the team's last player: the turn now ends
      expect(
        followed.events.map((e) => e.name)
      ).toContain(GameEventNames.TurnStarted);
      expect(followed.snapshot.activeTeamId).toBe(snap.teams[1].id);
    }

    expect(surfsTested).toBeGreaterThanOrEqual(5);
    // The seed sweep must have exercised Stunned -> Reserves at least once
    expect(stunnedToReserves).toBeGreaterThanOrEqual(1);
  });

  it("chain-pushing your own player into the crowd is exactly one turnover", async () => {
    for (let seed = 1; seed <= 200; seed++) {
      const game = new HeadlessGame({
        scenario: chainIntoCrowdScenario,
        seed,
      });
      const snap = game.snapshot();
      const attacker = snap.teams[0].players[0]; // (10,2)
      const teammate = snap.teams[0].players[1]; // (10,0), will surf
      const defender = snap.teams[1].players[0]; // (10,1)

      const pushed = await blockUntilPush(game, attacker.id, defender.id);
      if (!pushed) continue;

      // Fully boxed in on-pitch: chain tier
      const first = expectPushDecision(pushed.pendingDecision);
      expect(first.options).toEqual(
        expect.arrayContaining([
          { x: 10, y: 0 },
          { x: 9, y: 0 },
          { x: 11, y: 0 },
        ])
      );

      // Chain into our own teammate on the sideline
      const chained = await game.execute({
        type: "choose-push-direction",
        x: 10,
        y: 0,
      });
      const second = expectPushDecision(chained.pendingDecision);
      expect(second.defenderId).toBe(teammate.id);
      // Everything behind the teammate is off-pitch
      second.options.forEach((o) => expect(o.y).toBe(-1));

      const surfed = await game.execute({
        type: "choose-push-direction",
        x: second.options[0].x,
        y: second.options[0].y,
      });
      expect(surfed.ok).toBe(true);

      // Collect events across the surf and any trailing follow-up reply
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
      expect(
        names.filter((n) => n === GameEventNames.Turnover)
      ).toHaveLength(1);
      expect(
        names.filter((n) => n === GameEventNames.TurnStarted)
      ).toHaveLength(1);

      const after = game.snapshot();
      expect(after.activeTeamId).toBe(snap.teams[1].id);
      const teammateAfter = after.teams[0].players.find(
        (p) => p.id === teammate.id
      )!;
      expect(teammateAfter.position).toBeNull();
      const defenderAfter = after.teams[1].players.find(
        (p) => p.id === defender.id
      )!;
      expect(defenderAfter.position).toEqual({ x: 10, y: 0 });
      return;
    }
    throw new Error("no push result found in seed range");
  });
});

/**
 * Grab (rulebook p.135): the Black Orc attacker's Grab widens the open tier
 * to all eight on-pitch squares adjacent to the defender. These scenarios
 * lock that already-correct behavior in place, per
 * openspec/changes/fix-chain-push-grab-skill — Grab was never a code bug,
 * just uncovered by a scenario/test until now.
 */
describe("Grab-assisted push", () => {
  it("chain-push-grab-open: Grab offers the wider square as an open-tier choice", async () => {
    for (let seed = 1; seed <= 100; seed++) {
      const game = new HeadlessGame({ scenario: grabOpenScenario, seed });
      const snap = game.snapshot();
      const attacker = snap.teams[0].players[0]; // Black Orc, Grab, (9,5)
      const defender = snap.teams[1].players[0]; // (10,5)

      const pushed = await blockUntilPush(game, attacker.id, defender.id);
      if (!pushed) continue;

      // All three traditional squares are occupied, but (10,4) is open among
      // the eight Grab squares -> offered as the sole open-tier choice.
      const decision = expectPushDecision(pushed.pendingDecision);
      expect(decision.options).toEqual([{ x: 10, y: 4 }]);

      const raw = pushed.events.find(
        (e) => e.name === GameEventNames.UI_SelectPushDirection
      );
      expect(
        (raw?.data as { pushTier?: string } | undefined)?.pushTier
      ).toBe("open");
      return;
    }
    throw new Error("no push result found in seed range");
  });

  it("chain-push-grab-boxed: a fully boxed-in defender still chains over the normal three squares", async () => {
    for (let seed = 1; seed <= 100; seed++) {
      const game = new HeadlessGame({ scenario: grabBoxedScenario, seed });
      const snap = game.snapshot();
      const attacker = snap.teams[0].players[0]; // Black Orc, Grab, (9,5)
      const defender = snap.teams[1].players[0]; // (10,5), boxed in on all 8

      const pushed = await blockUntilPush(game, attacker.id, defender.id);
      if (!pushed) continue;

      // No opening anywhere among the eight Grab squares: falls back to the
      // normal three-square chain push, exactly as without Grab.
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
        (raw?.data as { pushTier?: string } | undefined)?.pushTier
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
      const attacker = snap.teams[0].players[0]; // Black Orc, Grab, (9,5)
      const defender = snap.teams[1].players[0]; // D0, (10,5), boxed on all 8
      const secondOccupant = snap.teams[1].players[2]; // (11,4), boxed on its own 3

      const pushed = await blockUntilPush(game, attacker.id, defender.id);
      if (!pushed) continue;

      // Link 0: D0 is fully boxed in on all 8, so this is the normal
      // three-square chain tier, same as chain-push-grab-boxed.
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
        (firstRaw?.data as { pushTier?: string } | undefined)?.pushTier
      ).toBe("chain");

      // Push into the occupied square at (11,4) -> forces a second link.
      // The occupant there is boxed on its own three traditional squares
      // (12,3),(12,4),(11,3), but (10,3) and (12,5) are open among its
      // wider eight. If Grab propagated to this second push, those two
      // squares would be offered as an "open" tier instead of the normal
      // three-square "chain" tier.
      const chained = await game.execute({
        type: "choose-push-direction",
        x: 11,
        y: 4,
      });
      const second = expectPushDecision(chained.pendingDecision);
      expect(second.defenderId).toBe(secondOccupant.id);
      expect(second.attackerId).toBe(attacker.id); // still the same Grab-holding blocker
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
        (secondRaw?.data as { pushTier?: string } | undefined)?.pushTier
      ).toBe("chain");
      return;
    }
    throw new Error("no push result found in seed range");
  });

  it("names Grab in the match log when the wider square set is offered", async () => {
    for (let seed = 1; seed <= 100; seed++) {
      const game = new HeadlessGame({ scenario: grabOpenScenario, seed });
      const snap = game.snapshot();
      const attacker = snap.teams[0].players[0];
      const defender = snap.teams[1].players[0];

      const pushed = await blockUntilPush(game, attacker.id, defender.id);
      if (!pushed) continue;

      const grabLogEntry = pushed.events.find(
        (e) =>
          e.name === GameEventNames.SkillTriggered &&
          (e.data as { skill?: string }).skill === SkillType.GRAB &&
          (e.data as { effect?: string }).effect
            ?.toLowerCase()
            .includes("usual three")
      );
      expect(grabLogEntry).toBeDefined();
      return;
    }
    throw new Error("no push result found in seed range");
  });
});

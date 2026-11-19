import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType, SkillCategory } from "../../src/types/Skills";
import { type Scenario } from "../../src/types/Scenario";
import { checkOwnership } from "../../src/network/OwnershipGate";
import { createMatch, uphillScenario } from "./sessionsHarness";

describe("networked sessions", () => {
  it("rejects an out-of-turn guest command without changing state", async () => {
    const match = createMatch({ seed: 7, startingPhase: GamePhase.SETUP });
    await match.host.executeLocal({ type: "coin-flip" });

    const before = JSON.stringify(match.game.snapshot());

    const response = await match.guest.sendCommand({ type: "end-turn" });

    expect(response.ok).toBe(false);
    expect(response.reason).toBe("not-your-turn");
    expect(JSON.stringify(match.game.snapshot())).toBe(before);
  });

  it("rejects guest commands that reference the host's players", async () => {
    const match = createMatch({ seed: 7, startingPhase: GamePhase.SETUP });

    await match.host.executeLocal({
      type: "start-setup",
      kickingTeamId: match.guestTeamId,
    });

    const hostPlayer = match.game.ctx.team1.players[0];
    const response = await match.guest.sendCommand({
      type: "place-player",
      playerId: fixtureValue(hostPlayer).id,
      x: 5,
      y: 5,
    });

    expect(response.ok).toBe(false);
    expect(response.reason).toBe("not-your-player");
  });

  it("rejects a forged special-attack command from the non-owner without mutation", async () => {
    const forgedScenario: Scenario = {
      ...uphillScenario,
      id: "forged-special-owner",
      setup: {
        ...uphillScenario.setup,
        activeTeam: "team2",
        team1Placements: [
          {
            playerIndex: 0,
            x: 10,
            y: 5,
            skills: [SkillType.STAB],
          },
        ],
      },
    };
    const match = createMatch({ scenario: forgedScenario, seed: 9 });
    const hostAttacker = match.game.ctx.team1.players[0];
    const guestTarget = match.game.ctx.team2.players[0];
    const before = JSON.stringify(match.game.snapshot());

    const response = await match.guest.sendCommand({
      type: "stab",
      attackerId: fixtureValue(hostAttacker).id,
      defenderId: fixtureValue(guestTarget).id,
    });

    expect(response.ok).toBe(false);
    expect(response.reason).toBe("not-your-player");
    expect(JSON.stringify(match.game.snapshot())).toBe(before);
  });

  it("rejects setup placement when it is not that coach's setup turn", async () => {
    const match = createMatch({ seed: 7, startingPhase: GamePhase.SETUP });

    await match.host.executeLocal({
      type: "start-setup",
      kickingTeamId: match.hostTeamId,
    });

    const guestPlayer = match.game.ctx.team2.players[0];
    const response = await match.guest.sendCommand({
      type: "place-player",
      playerId: fixtureValue(guestPlayer).id,
      x: 20,
      y: 5,
    });

    expect(response.ok).toBe(false);
    expect(response.reason).toBe("not-your-turn");
  });

  it("gives a guest the same named setup restriction as local/headless play", async () => {
    const match = createMatch({ seed: 8, startingPhase: GamePhase.SETUP });
    await match.host.executeLocal({
      type: "start-setup",
      kickingTeamId: match.guestTeamId,
    });
    const [first, second] = match.game.ctx.team2.players;

    expect(
      (
        await match.guest.sendCommand({
          type: "place-player",
          playerId: fixtureValue(first).id,
          x: 14,
          y: 0,
        })
      ).ok
    ).toBe(true);
    const response = await match.guest.sendCommand({
      type: "place-player",
      playerId: fixtureValue(second).id,
      x: 14,
      y: 1,
    });

    expect(response.ok).toBe(false);
    expect(response.reason).toContain(
      "Only one player may be set up in each Wide Zone."
    );
  });

  it("kickoff belongs to the kicking (non-active) team, not the active team", () => {
    const ctx = {
      activeTeamId: "receiving",
      pendingDecision: null,
      teamIdOfPlayer: (id: string) =>
        id.startsWith("kick") ? "kicking" : "receiving",
      hostTeamId: "kicking",
      phase: GamePhase.KICKOFF,
    };

    expect(
      checkOwnership(
        { type: "select-kicker", playerId: "kick-1" },
        "kicking",
        ctx
      ).allowed
    ).toBe(true);
    expect(
      checkOwnership(
        { type: "kick-ball", playerId: "kick-1", x: 5, y: 5 },
        "kicking",
        ctx
      ).allowed
    ).toBe(true);

    const denied = checkOwnership(
      { type: "select-kicker", playerId: "recv-1" },
      "receiving",
      ctx
    );
    expect(denied.allowed).toBe(false);
  });

  it("post-match SPP choices are limited to the coach's own team", () => {
    const ctx = {
      activeTeamId: "team-1",
      pendingDecision: null,
      teamIdOfPlayer: (id: string) =>
        id.startsWith("one") ? "team-1" : "team-2",
      hostTeamId: "team-1",
      phase: GamePhase.GAME_OVER,
    };

    expect(
      checkOwnership(
        {
          type: "award-mvp",
          teamId: "team-1",
          nominatedPlayerIds: ["one-1"],
        },
        "team-1",
        ctx
      ).allowed
    ).toBe(true);
    expect(
      checkOwnership(
        {
          type: "award-mvp",
          teamId: "team-2",
          nominatedPlayerIds: ["two-1"],
        },
        "team-1",
        ctx
      ).allowed
    ).toBe(false);
    expect(
      checkOwnership(
        { type: "assign-awarded-touchdown", playerId: "two-1" },
        "team-1",
        ctx
      ).allowed
    ).toBe(false);
  });

  it("uphill block dice: only the defender may choose", async () => {
    const match = createMatch({ scenario: uphillScenario, seed: 11 });
    const attacker = match.game.ctx.team1.players[0];
    const defender = match.game.ctx.team2.players[0];

    await match.host.executeLocal({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "block",
    });
    await match.host.executeLocal({
      type: "block",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
    });

    const pending = match.game.pendingDecision();
    expect(pending?.type).toBe("block-dice");
    if (pending?.type !== "block-dice") return;
    expect(pending.chooserTeamId).toBe(match.guestTeamId);

    const hostAttempt = await match.host.executeLocal({
      type: "choose-block-result",
      index: 0,
    });
    expect(hostAttempt.ok).toBe(false);
    expect(hostAttempt.reason).toBe("not-your-decision");

    const guestAttempt = await match.guest.sendCommand({
      type: "choose-block-result",
      index: 0,
    });
    expect(guestAttempt.ok).toBe(true);
  });

  it("a reroll decision is accepted only from the rolling coach's session", async () => {
    const guestPickup: Scenario = {
      id: "guest-pickup",
      name: "Guest pickup",
      description: "guest mover picks up with rerolls banked",
      setup: {
        team1Placements: [{ playerIndex: 0, x: 18, y: 8 }],
        team2Placements: [{ playerIndex: 0, x: 4, y: 5 }],
        activeTeam: "team2",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 5, y: 5 },
      },
    };

    for (let seed = 1; seed <= 100; seed++) {
      const match = createMatch({ scenario: guestPickup, seed });
      match.game.ctx.team2.rerolls = 3;
      match.guestGame.ctx.team2.rerolls = 3;
      const mover = match.game.ctx.team2.players[0];

      await match.guest.sendCommand({
        type: "declare-action",
        playerId: fixtureValue(mover).id,
        action: "move",
      });
      await match.guest.sendCommand({
        type: "move",
        playerId: fixtureValue(mover).id,
        path: [{ x: 5, y: 5 }],
      });

      const pending = match.game.pendingDecision();
      if (pending?.type !== "reroll") continue;
      expect(pending.chooserTeamId).toBe(match.guestTeamId);

      const hostAttempt = await match.host.executeLocal({
        type: "use-reroll",
        accept: true,
      });
      expect(hostAttempt.ok).toBe(false);
      expect(hostAttempt.reason).toBe("not-your-decision");
      expect(match.game.pendingDecision()?.type).toBe("reroll");

      const guestAttempt = await match.guest.sendCommand({
        type: "use-reroll",
        accept: true,
        source: "team",
      });
      expect(guestAttempt.ok).toBe(true);
      expect(fixtureValue(match.game.snapshot().teams[1]).rerolls).toBe(2);
      return;
    }
    throw new Error("no failing pickup found in seed range");
  });

  it("a reaction decision belongs to the REACTING coach, not the actor", async () => {
    const standFirmScenario: Scenario = {
      id: "standfirm-online",
      name: "Stand Firm online",
      description: "host blocks a guest defender who has Stand Firm",
      setup: {
        team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
        team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 1, y: 1 },
      },
    };

    for (let seed = 1; seed <= 60; seed++) {
      const match = createMatch({ scenario: standFirmScenario, seed });
      const attacker = match.game.ctx.team1.players[0];
      const defender = match.game.ctx.team2.players[0];
      fixtureValue(defender).skills.push({
        type: SkillType.STAND_FIRM,
        category: SkillCategory.GENERAL,
        description: "",
      });

      await match.host.executeLocal({
        type: "declare-action",
        playerId: fixtureValue(attacker).id,
        action: "block",
      });
      await match.host.executeLocal({
        type: "block",
        attackerId: fixtureValue(attacker).id,
        defenderId: fixtureValue(defender).id,
      });

      const dice = match.game.pendingDecision();
      if (dice?.type !== "block-dice") continue;
      const pushIndex = dice.options.findIndex((o) =>
        ["push", "pow", "pow-dodge"].includes(o.type)
      );
      if (pushIndex < 0) continue;

      await match.host.executeLocal({
        type: "choose-block-result",
        index: pushIndex,
      });

      const pending = match.game.pendingDecision();
      expect(pending?.type).toBe("reaction");
      if (pending?.type !== "reaction") return;
      expect(pending.chooserTeamId).toBe(match.guestTeamId);
      expect(pending.skill).toBe(SkillType.STAND_FIRM);

      const hostAttempt = await match.host.executeLocal({
        type: "use-reaction",
        accept: false,
      });
      expect(hostAttempt.ok).toBe(false);
      expect(hostAttempt.reason).toBe("not-your-decision");

      const guestAttempt = await match.guest.sendCommand({
        type: "use-reaction",
        accept: true,
      });
      expect(guestAttempt.ok).toBe(true);
      expect(fixtureValue(defender).gridPosition).toEqual({ x: 11, y: 5 });
      return;
    }
    throw new Error("no push result rolled in seed range");
  });
});

import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import {
  type OnlineMatch,
  setActiveOnlineMatch,
} from "../../src/network/OnlineMatch";
import { type PendingDecision } from "../../src/headless/protocol";
import { FollowUpDialog } from "../../src/ui/components/hud/FollowUpDialog";
import { RerollDialog } from "../../src/ui/components/hud/RerollDialog";
import { BlockDiceDialog } from "../../src/ui/components/hud/BlockDiceDialog";
import { type BlockRollData } from "../../src/services/BlockResolutionService";

describe("online dialogs", () => {
  let container: HTMLDivElement;
  let root: Root;
  let eventBus: EventBus;
  let mayAct = true;
  let pending: PendingDecision | null = null;
  let team1Ids: string[];
  let team2Ids: string[];

  beforeEach(() => {
    const game = new HeadlessGame({ seed: 1 });
    eventBus = new EventBus();
    ServiceContainer.initialize({ eventBus: eventBus, team1: game.ctx.team1, team2: game.ctx.team2 });
    team1Ids = game.ctx.team1.players.map((p) => p.id);
    team2Ids = game.ctx.team2.players.map((p) => p.id);
    setActiveOnlineMatch({
      mayAct: () => mayAct,
      pendingDecision: () => pending,
    } as OnlineMatch);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    setActiveOnlineMatch(null);
    ServiceContainer.reset();
    vi.useRealTimers();
  });

  const askReroll = () => {
    eventBus.emit(GameEventNames.DecisionRequested, {
      type: "reroll",
      playerId: team1Ids[0],
      chooserTeamId: "team1",
      rollKind: "dodge",
      sources: ["team"],
      roll: 1,
    } as never);
  };

  it("shows a re-roll prompt to the coach who rolled it", async () => {
    mayAct = true;
    await act(async () => {
      root.render(<RerollDialog eventBus={eventBus} />);
    });
    await act(async () => {
      askReroll();
    });
    expect(container.textContent).toContain("Re-roll");
  });

  it("does not show a follow-up the computer has already answered", async () => {
    mayAct = true;
    pending = null;
    await act(async () => {
      root.render(<FollowUpDialog eventBus={eventBus} />);
    });
    await act(async () => {
      eventBus.emit(GameEventNames.UI_FollowUpPrompt, {
        attackerId: "team2-player-1",
        targetSquare: { x: 5, y: 5 },
        repeat: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(container.textContent).not.toContain("Follow Up?");
  });

  it("keeps a newer follow-up when an older one's repeat arrives", async () => {
    mayAct = true;
    pending = {
      type: "follow-up",
      attackerId: "team1-player-2",
      targetSquare: { x: 6, y: 6 },
    };
    await act(async () => {
      root.render(<FollowUpDialog eventBus={eventBus} />);
    });
    await act(async () => {
      eventBus.emit(GameEventNames.UI_FollowUpPrompt, {
        attackerId: "team1-player-2",
        targetSquare: { x: 6, y: 6 },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(container.textContent).toContain("Follow Up?");
    await act(async () => {
      eventBus.emit(GameEventNames.UI_FollowUpPrompt, {
        attackerId: "team1-player-1",
        targetSquare: { x: 5, y: 5 },
        repeat: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(container.textContent).toContain("Follow Up?");
  });

  it("shows a held follow-up even if an older repeat arrived meanwhile", async () => {
    mayAct = false;
    pending = {
      type: "reroll",
      playerId: "team2-player-2",
      chooserTeamId: "team2",
      rollKind: "catch",
      sources: ["skill"],
    } as PendingDecision;
    await act(async () => {
      root.render(<FollowUpDialog eventBus={eventBus} />);
    });
    await act(async () => {
      eventBus.emit(GameEventNames.UI_FollowUpPrompt, {
        attackerId: "team1-player-2",
        targetSquare: { x: 6, y: 6 },
      });
      eventBus.emit(GameEventNames.UI_FollowUpPrompt, {
        attackerId: "team1-player-1",
        targetSquare: { x: 5, y: 5 },
        repeat: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    mayAct = true;
    pending = {
      type: "follow-up",
      attackerId: "team1-player-2",
      targetSquare: { x: 6, y: 6 },
    };
    await act(() => new Promise((resolve) => setTimeout(resolve, 450)));
    expect(container.textContent).toContain("Follow Up?");
  });

  it("waits for a new follow-up's own prompt after an old repeat", async () => {
    mayAct = true;
    pending = null;
    await act(async () => {
      root.render(<FollowUpDialog eventBus={eventBus} />);
    });
    await act(async () => {
      eventBus.emit(GameEventNames.UI_FollowUpPrompt, {
        attackerId: "team1-player-1",
        targetSquare: { x: 5, y: 5 },
        repeat: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    pending = {
      type: "follow-up",
      attackerId: "team1-player-2",
      targetSquare: { x: 6, y: 6 },
    };
    await act(() => new Promise((resolve) => setTimeout(resolve, 450)));
    expect(container.textContent).not.toContain("Follow Up?");

    await act(async () => {
      eventBus.emit(GameEventNames.UI_FollowUpPrompt, {
        attackerId: "team1-player-2",
        targetSquare: { x: 6, y: 6 },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(container.textContent).toContain("Follow Up?");
  });

  it("shows a follow-up handed back after the other coach's decision", async () => {
    mayAct = false;
    pending = {
      type: "reroll",
      playerId: "team2-player-2",
      chooserTeamId: "team2",
      rollKind: "catch",
      sources: ["skill"],
    } as PendingDecision;
    await act(async () => {
      root.render(<FollowUpDialog eventBus={eventBus} />);
    });
    await act(async () => {
      eventBus.emit(GameEventNames.UI_FollowUpPrompt, {
        attackerId: "team1-player-1",
        targetSquare: { x: 5, y: 5 },
        repeat: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(container.textContent).not.toContain("Follow Up?");

    mayAct = true;
    pending = {
      type: "follow-up",
      attackerId: "team1-player-1",
      targetSquare: { x: 5, y: 5 },
    };
    await act(() => new Promise((resolve) => setTimeout(resolve, 450)));
    expect(container.textContent).toContain("Follow Up?");
  });

  it("does not show it on the other coach's screen", async () => {
    mayAct = false;
    await act(async () => {
      root.render(<RerollDialog eventBus={eventBus} />);
    });
    await act(async () => {
      askReroll();
    });
    expect(container.innerHTML).toBe("");
  });

  it("keeps Frenzy's second dice visible after the first result's hold timer expires", async () => {
    vi.useFakeTimers();
    mayAct = true;
    await act(async () => {
      root.render(<BlockDiceDialog eventBus={eventBus} />);
    });
    const roll = {
      attackerId: fixtureValue(team1Ids[0]),
      defenderId: fixtureValue(team2Ids[0]),
      numDice: 1,
      isAttackerChoice: true,
      results: [{ type: "push", label: "Push", icon: "" }],
      teamRerollAvailable: false,
      proAvailable: false,
      brawlerAvailable: false,
    } satisfies BlockRollData;
    await act(async () => {
      eventBus.emit(GameEventNames.BlockDiceRolled, roll);
    });
    await act(async () => {
      eventBus.emit(GameEventNames.DecisionResolved, {
        type: "block-dice",
        result: "push",
      });
    });
    expect(container.textContent).toContain("Chosen: PUSH");
    await act(async () => vi.advanceTimersByTime(500));
    await act(async () => {
      eventBus.emit(GameEventNames.BlockDiceRolled, { ...roll });
    });
    await act(async () => vi.advanceTimersByTime(1500));

    expect(
      container.querySelector('[data-testid="block-dice-dialog"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="block-die-0"]')
    ).not.toBeNull();
    expect(container.textContent).not.toContain("Chosen:");
  });

  it("shows the other coach's block dice and then the face they picked", async () => {
    mayAct = false;
    await act(async () => {
      root.render(<BlockDiceDialog eventBus={eventBus} />);
    });
    const roll = {
      attackerId: team1Ids[0],
      defenderId: team2Ids[0],
      numDice: 2,
      isAttackerChoice: true,
      results: [{ type: "pow" }, { type: "skull" }],
    } as unknown as BlockRollData;
    await act(async () => {
      eventBus.emit(GameEventNames.BlockDiceRolled, roll);
    });
    expect(container.innerHTML).toContain("block-dice-dialog");

    for (
      let i = 0;
      i < 60 && !container.textContent?.includes("The other coach is choosing");
      i++
    ) {
      await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    }
    expect(container.textContent).toContain("The other coach is choosing");

    await act(async () => {
      eventBus.emit(GameEventNames.DecisionResolved, {
        type: "block-dice",
        result: "pow",
      });
    });
    expect(container.textContent).toContain("Chosen: POW");

    await act(async () => new Promise((resolve) => setTimeout(resolve, 1600)));
    expect(container.innerHTML).toBe("");
  });
});

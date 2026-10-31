/**
 * A decision that follows a roll names that roll's result. It must not show
 * while the die is still tumbling in the tray, or it gives the result away
 * before the coach sees it land. Each dialog, and the waiting coach's
 * banner, appears only once the dice thrown before it have landed.
 */
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";
import type { DecisionRequest } from "../../src/types/decisions";
import type { OnlineMatch } from "../../src/network/OnlineMatch";
import { RerollDialog } from "../../src/ui/components/hud/RerollDialog";
import { ReactionDialog } from "../../src/ui/components/hud/ReactionDialog";
import { InterceptionDialog } from "../../src/ui/components/hud/InterceptionDialog";
import { ApothecaryDialog } from "../../src/ui/components/hud/ApothecaryDialog";
import { ConfirmationModal } from "../../src/ui/components/hud/ConfirmationModal";
import { BlockDiceDialog } from "../../src/ui/components/hud/BlockDiceDialog";
import { WaitingBanner } from "../../src/ui/pages/WaitingBanner";

let container: HTMLDivElement;
let root: Root;
let bus: EventBus;
let playerId: string;
let defenderId: string;
let teamId: string;

beforeEach(() => {
  const game = new HeadlessGame({ seed: 1 });
  bus = new EventBus();
  ServiceContainer.initialize(bus, game.ctx.team1, game.ctx.team2);
  playerId = game.ctx.team1.players[0].id;
  defenderId = game.ctx.team2.players[0].id;
  teamId = game.ctx.team1.id;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  ServiceContainer.reset();
  vi.useRealTimers();
});

/** What the tray reports: rolls thrown, and up to which one all landed. */
const tray = (thrown: number, landedThrough: number) =>
  bus.emit(GameEventNames.UI_DiceInAir, {
    count: thrown - landedThrough,
    thrown,
    landedThrough,
  });

const shown = (testId: string) =>
  container.querySelector(`[data-testid="${testId}"]`);

describe("decision dialogs wait for the die to land", () => {
  const cases: [string, React.FC<{ eventBus: EventBus }>, () => DecisionRequest][] =
    [
      [
        "reroll-dialog",
        RerollDialog,
        () => ({
          type: "reroll",
          playerId,
          chooserTeamId: teamId,
          rollKind: "dodge",
          sources: ["team"],
          roll: 1,
          needed: 3,
        }),
      ],
      [
        "reaction-dialog",
        ReactionDialog,
        () => ({
          type: "reaction",
          playerId,
          chooserTeamId: teamId,
          skill: "Fend",
          prompt: "Use Fend?",
        }),
      ],
      [
        "interception-dialog",
        InterceptionDialog,
        () => ({
          type: "interception",
          chooserTeamId: teamId,
          passerId: playerId,
          candidates: [{ playerId: defenderId, modifier: -3 }],
        }),
      ],
      [
        "apothecary-dialog",
        ApothecaryDialog,
        () => ({
          type: "apothecary",
          id: "apo-1",
          chooserTeamId: teamId,
          playerId,
          resultKind: "ko",
        }),
      ],
    ];

  it.each(cases)("%s", async (testId, Dialog, request) => {
    await act(async () => root.render(<Dialog eventBus={bus} />));
    await act(async () => {
      tray(1, 0);
      bus.emit(GameEventNames.DecisionRequested, request());
    });
    expect(shown(testId)).toBeNull();

    await act(async () => tray(1, 1));
    expect(shown(testId)).not.toBeNull();
  });

  it("re-roll dialog says the roll only after it lands", async () => {
    await act(async () => root.render(<RerollDialog eventBus={bus} />));
    await act(async () => {
      tray(1, 0);
      bus.emit(GameEventNames.DecisionRequested, cases[0][2]());
    });
    expect(container.textContent).not.toContain("rolled 1");
    await act(async () => tray(1, 1));
    expect(shown("reroll-odds")?.textContent).toBe("Needed 3+, rolled 1.");
  });

  it("confirmation", async () => {
    await act(async () => root.render(<ConfirmationModal eventBus={bus} />));
    await act(async () => {
      tray(1, 0);
      bus.emit(GameEventNames.UI_RequestConfirmation, {
        actionId: "rush-1",
        title: "Rush?",
        message: "Rush to keep going",
      });
    });
    expect(container.textContent).not.toContain("Rush?");
    await act(async () => tray(1, 1));
    expect(container.textContent).toContain("Rush?");
  });

  it("block dice choices show once the block dice land", async () => {
    await act(async () => root.render(<BlockDiceDialog eventBus={bus} />));
    await act(async () =>
      bus.emit(GameEventNames.UI_BlockDialog, {
        attackerId: playerId,
        defenderId,
        analysis: {
          diceCount: 1,
          isUphill: false,
          attackerST: 3,
          defenderST: 3,
          attackerAssists: [],
          defenderAssists: [],
        },
      })
    );
    await act(async () => {
      tray(1, 0);
      bus.emit(GameEventNames.BlockDiceRolled, {
        attackerId: playerId,
        defenderId,
        numDice: 1,
        isAttackerChoice: true,
        results: [{ type: "pow", icon: "", label: "POW" }],
        teamRerollAvailable: false,
        proAvailable: false,
        brawlerAvailable: false,
        veteranRerollAvailable: false,
      });
    });
    expect(shown("block-die-0")).toBeNull();
    await act(async () => tray(1, 1));
    expect(shown("block-die-0")?.textContent).toBe("POW");
  });
});

describe("the waiting coach's banner waits for the die to land", () => {
  it("keeps the turn line until the re-roll's die lands", async () => {
    vi.useFakeTimers();
    ServiceContainer.getInstance().gameService.getState().phase =
      GamePhase.PLAY;
    let label = "Coach-KWAZ's turn (Gouged Eye)…";
    const match: Pick<OnlineMatch, "mayAct" | "waitingLabel"> = {
      mayAct: () => false,
      waitingLabel: () => label,
    };
    await act(async () =>
      root.render(<WaitingBanner match={match} eventBus={bus} />)
    );
    await act(async () => {
      tray(1, 0);
      label = "Gouged Eye is choosing a re-roll";
      vi.advanceTimersByTime(1200);
    });
    expect(shown("waiting-banner")?.textContent).toBe(
      "⏳ Coach-KWAZ's turn (Gouged Eye)…"
    );
    await act(async () => {
      tray(1, 1);
      vi.advanceTimersByTime(500);
    });
    expect(shown("waiting-banner")?.textContent).toBe(
      "⏳ Gouged Eye is choosing a re-roll"
    );
  });
});

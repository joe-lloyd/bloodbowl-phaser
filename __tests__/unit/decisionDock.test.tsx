import { MemoryRouter } from "react-router-dom";
import { GameHUD } from "../../src/ui/components/hud/GameHUD";
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import { RerollDialog } from "../../src/ui/components/hud/RerollDialog";
import { ConfirmationModal } from "../../src/ui/components/hud/ConfirmationModal";
import { FollowUpDialog } from "../../src/ui/components/hud/FollowUpDialog";
import { BlockDiceDialog } from "../../src/ui/components/hud/BlockDiceDialog";

const online = vi.hoisted(() => ({ waiting: false }));
vi.mock("../../src/network/OnlineMatch", () => ({
  getActiveOnlineMatch: () => (online.waiting ? { mayAct: () => false } : null),
}));

describe("decision dock", () => {
  let container: HTMLDivElement;
  let root: Root;
  let eventBus: EventBus;
  let playerId: string;
  let defenderId: string;
  let teamId: string;

  beforeEach(() => {
    online.waiting = false;
    const game = new HeadlessGame({ seed: 1 });
    eventBus = new EventBus();
    ServiceContainer.initialize(eventBus, game.ctx.team1, game.ctx.team2);
    playerId = game.ctx.team1.players[0].id;
    defenderId = game.ctx.team2.players[0].id;
    teamId = game.ctx.team1.id;
    const service = ServiceContainer.getInstance().gameService;
    service.getState().turn.teamId = teamId;
    service.getTeam(teamId)!.rerolls = 2;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    ServiceContainer.reset();
  });

  it("prompts for a push square while the board offers its highlights", async () => {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <GameHUD eventBus={eventBus} />
        </MemoryRouter>
      )
    );
    await act(async () =>
      eventBus.emit(GameEventNames.UI_SelectPushDirection, {
        attackerId: playerId,
        defenderId,
        canFollowUp: true,
        chooserTeamId: teamId,
        validDirections: [
          { x: 5, y: 4 },
          { x: 6, y: 5 },
        ],
      })
    );
    expect(container.textContent).toContain("Choose a push square");
    await act(async () =>
      eventBus.emit(GameEventNames.UI_PushDirectionSelected, {
        defenderId,
        direction: { x: 5, y: 4 },
        canFollowUp: true,
      })
    );
    expect(container.textContent).not.toContain("Choose a push square");
  });

  it("offers Pro and sends the pro source to the engine", async () => {
    await act(async () => root.render(<RerollDialog eventBus={eventBus} />));
    const answer = vi.fn();
    eventBus.on(GameEventNames.UI_RerollResponse, answer);
    await act(async () =>
      eventBus.emit(GameEventNames.DecisionRequested, {
        type: "reroll",
        playerId,
        chooserTeamId: teamId,
        rollKind: "dodge",
        sources: ["pro"],
        roll: 2,
      })
    );
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="reroll-use-pro"]'
    );
    expect(button?.textContent).toContain("PRO");
    await act(async () => button?.click());
    expect(answer).toHaveBeenCalledWith({ accept: true, source: "pro" });
  });

  it("shows the failed target and chance for every offered source", async () => {
    await act(async () => root.render(<RerollDialog eventBus={eventBus} />));
    await act(async () =>
      eventBus.emit(GameEventNames.DecisionRequested, {
        type: "reroll",
        playerId,
        chooserTeamId: teamId,
        rollKind: "dodge",
        sources: ["skill", "pro", "team", "veteran"],
        skill: "Dodge",
        roll: 2,
        needed: 3,
      })
    );
    expect(container.textContent).toContain(
      "Needed 3+, rolled 2. Re-roll: 67%"
    );
    expect(container.textContent).toContain("Pro needs 3+");
    expect(
      container.querySelectorAll('[data-testid^="reroll-use-"]')
    ).toHaveLength(4);
  });

  it("closes a step prompt when the turn ends", async () => {
    await act(async () =>
      root.render(<ConfirmationModal eventBus={eventBus} />)
    );
    await act(async () =>
      eventBus.emit(GameEventNames.UI_RequestConfirmation, {
        actionId: "risky-step-1",
        title: "Dodge",
        message: "Dodge: 3+",
        confirmLabel: "Dodge!",
      })
    );
    expect(container.textContent).toContain("Dodge!");
    const answer = vi.fn();
    eventBus.on(GameEventNames.UI_ConfirmationResult, answer);
    // The turn clock ends the turn through the service, as End Turn does
    const service = ServiceContainer.getInstance().gameService;
    await act(async () => {
      service.startTurn(teamId);
      service.endTurn();
    });
    expect(container.innerHTML).toBe("");
    expect(answer).toHaveBeenCalledWith({
      actionId: "risky-step-1",
      confirmed: false,
    });
  });

  it("waits for armour and bounce dice before offering follow-up", async () => {
    await act(async () => root.render(<FollowUpDialog eventBus={eventBus} />));
    await act(async () => {
      eventBus.emit(GameEventNames.UI_DiceInAir, {
        count: 2,
        thrown: 2,
        landedThrough: 0,
      });
      eventBus.emit(GameEventNames.UI_FollowUpPrompt, {
        attackerId: playerId,
        targetSquare: { x: 5, y: 5 },
      });
    });
    expect(container.innerHTML).toBe("");
    await act(async () =>
      eventBus.emit(GameEventNames.UI_DiceInAir, {
        count: 0,
        thrown: 2,
        landedThrough: 2,
      })
    );
    expect(container.textContent).toContain("Follow Up?");
  });

  it("asks the attacker about re-rolls before showing the defender pick header", async () => {
    await act(async () => root.render(<BlockDiceDialog eventBus={eventBus} />));
    await act(async () =>
      eventBus.emit(GameEventNames.UI_BlockDialog, {
        attackerId: playerId,
        defenderId,
        analysis: {
          diceCount: 2,
          isUphill: true,
          attackerST: 2,
          defenderST: 4,
          attackerAssists: [],
          defenderAssists: [],
        },
      })
    );
    const roll = {
      attackerId: playerId,
      defenderId,
      numDice: 2,
      isAttackerChoice: false,
      results: [{ type: "push", label: "Push", icon: "" }],
      teamRerollAvailable: true,
    } satisfies import("../../src/services/BlockResolutionService").BlockRollData;
    await act(async () =>
      eventBus.emit(GameEventNames.BlockDiceRolled, {
        ...roll,
        choiceStage: "attacker-reroll",
      })
    );
    expect(container.textContent).toContain("Home Team: re-roll first?");
    expect(container.querySelector('[data-testid="block-die-0"]')).toBeNull();
    const keep = container.querySelector<HTMLButtonElement>(
      '[data-testid="block-keep-dice"]'
    );
    expect(keep?.textContent).toBe("Keep dice");
    const answer = vi.fn();
    eventBus.on(GameEventNames.UI_KeepBlockDice, answer);
    await act(async () => keep?.click());
    expect(answer).toHaveBeenCalledWith({ attackerId: playerId });
    await act(async () =>
      eventBus.emit(GameEventNames.BlockDiceRolled, {
        ...roll,
        choiceStage: "pick",
        teamRerollAvailable: false,
      })
    );
    expect(
      container.querySelector('[data-testid="decision-team"]')?.textContent
    ).toBe("Away Team PICK");
    await act(async () =>
      eventBus.emit(GameEventNames.BlockDiceRolled, {
        ...roll,
        isAttackerChoice: true,
        choiceStage: "pick",
        teamRerollAvailable: false,
      })
    );
    expect(
      container.querySelector('[data-testid="decision-team"]')?.textContent
    ).toBe("Home Team");
    expect(container.textContent).toContain("Attacker Chooses");
  });

  it("shows waiting coaches a block without action buttons", async () => {
    await act(async () => root.render(<BlockDiceDialog eventBus={eventBus} />));
    await act(async () =>
      eventBus.emit(GameEventNames.UI_BlockDialog, {
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
    online.waiting = true;
    await act(async () =>
      eventBus.emit(GameEventNames.BlockDiceRolled, {
        attackerId: playerId,
        defenderId,
        numDice: 1,
        isAttackerChoice: true,
        results: [{ type: "push", label: "Push", icon: "" }],
        teamRerollAvailable: true,
      })
    );
    expect(container.textContent).toContain("The other coach is choosing");
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
});

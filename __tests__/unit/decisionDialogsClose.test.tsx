import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { DecisionRequest } from "../../src/types/decisions";
import { RerollDialog } from "../../src/ui/components/hud/RerollDialog";
import { ReactionDialog } from "../../src/ui/components/hud/ReactionDialog";
import { InterceptionDialog } from "../../src/ui/components/hud/InterceptionDialog";
import { ApothecaryDialog } from "../../src/ui/components/hud/ApothecaryDialog";
import { InducementChoiceDialog } from "../../src/ui/components/hud/InducementChoiceDialog";

/**
 * Online, both coaches see the engine's decision prompts, but only the one
 * who owns the decision answers it. The other coach's dialog has to close
 * when the decision is settled, or it covers their screen for the rest of
 * the match.
 */
describe("decision dialogs close once the decision is settled", () => {
  let container: HTMLDivElement;
  let root: Root;
  let eventBus: EventBus;
  let playerId: string;
  let teamId: string;

  beforeEach(() => {
    const game = new HeadlessGame({ seed: 1 });
    eventBus = new EventBus();
    ServiceContainer.initialize(eventBus, game.ctx.team1, game.ctx.team2);
    playerId = game.ctx.team1.players[0].id;
    teamId = game.ctx.team1.id;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    ServiceContainer.reset();
  });

  const cases: [
    string,
    React.FC<{ eventBus: EventBus }>,
    () => DecisionRequest,
  ][] = [
    [
      "reroll",
      RerollDialog as React.FC<{ eventBus: EventBus }>,
      () =>
        ({
          type: "reroll",
          playerId,
          chooserTeamId: teamId,
          rollKind: "dodge",
          sources: ["team"],
          roll: 1,
        }) as DecisionRequest,
    ],
    [
      "reaction",
      ReactionDialog as React.FC<{ eventBus: EventBus }>,
      () =>
        ({
          type: "reaction",
          playerId,
          chooserTeamId: teamId,
          skill: "Fend",
          prompt: "Use Fend?",
        }) as DecisionRequest,
    ],
    [
      "interception",
      InterceptionDialog as React.FC<{ eventBus: EventBus }>,
      () =>
        ({
          type: "interception",
          chooserTeamId: teamId,
          passerId: playerId,
          candidates: [{ playerId, modifier: -3 }],
        }) as DecisionRequest,
    ],
    [
      "apothecary",
      ApothecaryDialog as React.FC<{ eventBus: EventBus }>,
      () =>
        ({
          type: "apothecary",
          id: "apo-1",
          chooserTeamId: teamId,
          playerId,
          resultKind: "ko",
        }) as DecisionRequest,
    ],
    [
      "inducement-choice",
      InducementChoiceDialog as React.FC<{ eventBus: EventBus }>,
      () =>
        ({
          type: "inducement-choice",
          kind: "hangover",
          chooserTeamId: teamId,
          playerIds: [playerId],
        }) as DecisionRequest,
    ],
  ];

  it.each(cases)("%s", async (_type, Dialog, request) => {
    await act(async () => root.render(<Dialog eventBus={eventBus} />));
    const decisions =
      ServiceContainer.getInstance().gameService.getDecisionService();

    await act(async () => void decisions.request(request()));
    expect(container.innerHTML).not.toBe("");

    // The other coach answered: this page never touched the dialog
    await act(async () => void decisions.answer({ accept: false } as never));
    expect(container.innerHTML).toBe("");
  });
});

import { fixtureValue } from "../../src/testing/fixtureValue";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type DecisionRequest } from "../../src/types/decisions";
import { RerollDialog } from "../../src/ui/components/hud/RerollDialog";
import { ReactionDialog } from "../../src/ui/components/hud/ReactionDialog";
import { InterceptionDialog } from "../../src/ui/components/hud/InterceptionDialog";
import { ApothecaryDialog } from "../../src/ui/components/hud/ApothecaryDialog";
import { InducementChoiceDialog } from "../../src/ui/components/hud/InducementChoiceDialog";
import { FoulAssistsDialog } from "../../src/ui/components/hud/FoulAssistsDialog";

describe("decision dialogs close once the decision is settled", () => {
  let container: HTMLDivElement;
  let root: Root;
  let eventBus: EventBus;
  let playerId: string;
  let teamId: string;

  beforeEach(() => {
    const game = new HeadlessGame({ seed: 1 });
    eventBus = new EventBus();
    ServiceContainer.initialize({ eventBus: eventBus, team1: game.ctx.team1, team2: game.ctx.team2 });
    playerId = fixtureValue(game.ctx.team1.players[0]).id;
    teamId = game.ctx.team1.id;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
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
      RerollDialog,
      () => ({
        type: "reroll",
        playerId,
        chooserTeamId: teamId,
        rollKind: "dodge",
        sources: ["team"],
        roll: 1,
      }),
    ],
    [
      "reaction",
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
      "interception",
      InterceptionDialog,
      () => ({
        type: "interception",
        chooserTeamId: teamId,
        passerId: playerId,
        candidates: [{ playerId, modifier: -3 }],
      }),
    ],
    [
      "apothecary",
      ApothecaryDialog,
      () => ({
        type: "apothecary",
        id: "apo-1",
        chooserTeamId: teamId,
        playerId,
        resultKind: "ko",
      }),
    ],
    [
      "inducement-choice",
      InducementChoiceDialog,
      () =>
        ({
          type: "inducement-choice",
          kind: "hangover",
          chooserTeamId: teamId,
          playerIds: [playerId],
        }) as DecisionRequest,
    ],
    [
      "foul-assists",
      FoulAssistsDialog,
      () => ({
        type: "foul-assists",
        playerId,
        targetId: playerId,
        chooserTeamId: teamId,
        available: 2,
        defensive: 0,
      }),
    ],
  ];

  it.each(cases)("%s", async (_type, Dialog, request) => {
    await act(async () => {
      root.render(<Dialog eventBus={eventBus} />);
    });
    const decisions =
      ServiceContainer.getInstance().gameService.getDecisionService();

    await act(async () => void decisions.request(request()));
    expect(container.innerHTML).not.toBe("");

    await act(async () => void decisions.answer({ accept: false }));
    expect(container.innerHTML).toBe("");
  });
});

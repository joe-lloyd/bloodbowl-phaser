import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import {
  OnlineMatch,
  setActiveOnlineMatch,
} from "../../src/network/OnlineMatch";
import { PendingDecision } from "../../src/headless/protocol";
import { BiteTargetPrompt } from "../../src/ui/components/hud/BiteTargetPrompt";

/**
 * Online, "Bite nobody" is only sent: the host may refuse it. The prompt
 * stays until the bite is resolved, and a refusal offers it again.
 */
describe("the Bloodlust bite prompt", () => {
  let container: HTMLDivElement;
  let root: Root;
  let eventBus: EventBus;
  let pending: PendingDecision | null;
  let answer: ReturnType<typeof vi.fn>;
  let request: PendingDecision;

  beforeEach(async () => {
    const game = new HeadlessGame({ seed: 1 });
    eventBus = new EventBus();
    ServiceContainer.initialize(eventBus, game.ctx.team1, game.ctx.team2);
    const ids = game.ctx.team1.players.map((p) => p.id);
    request = {
      type: "bite-target",
      playerId: ids[0],
      chooserTeamId: game.ctx.team1.id,
      targetIds: [ids[1], ids[2]],
    };
    pending = request;
    answer = vi.fn(() => true);
    ServiceContainer.getInstance().gameService.answerBiteTarget = answer;
    setActiveOnlineMatch({
      mayAct: () => true,
      pendingDecision: () => pending,
    } as OnlineMatch);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () =>
      root.render(<BiteTargetPrompt eventBus={eventBus} />)
    );
    await act(async () =>
      eventBus.emit(GameEventNames.DecisionRequested, request as never)
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    setActiveOnlineMatch(null);
    ServiceContainer.reset();
  });

  const prompt = () =>
    container.querySelector('[data-testid="bite-target-prompt"]');
  const biteNobody = () =>
    container.querySelector<HTMLButtonElement>(
      '[data-testid="bite-target-none"]'
    )!;
  const reject = () =>
    act(async () =>
      eventBus.emit(GameEventNames.NetworkCommandRejected, {
        commandType: "choose-bite-target",
        reason: "command-failed: no-bite-target-awaiting",
      })
    );

  it("stays up after Bite nobody until the bite is resolved", async () => {
    await act(async () => biteNobody().click());

    expect(answer).toHaveBeenCalledWith(undefined);
    expect(prompt()).not.toBeNull();
    expect(biteNobody().disabled).toBe(true);

    await act(async () =>
      eventBus.emit(GameEventNames.DecisionResolved, { type: "bite-target" })
    );
    expect(prompt()).toBeNull();
  });

  it("offers the bite again when the host refuses the answer", async () => {
    await act(async () => biteNobody().click());
    await reject();

    expect(prompt()).not.toBeNull();
    expect(biteNobody().disabled).toBe(false);
    await act(async () => biteNobody().click());
    expect(answer).toHaveBeenCalledTimes(2);
  });

  it("closes on a refusal once the bite is no longer pending", async () => {
    await act(async () => biteNobody().click());
    pending = null;
    await reject();

    expect(prompt()).toBeNull();
  });
});

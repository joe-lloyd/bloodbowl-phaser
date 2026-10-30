import { getSkill, SkillType } from "../../src/types/Skills";
import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import { RerollDecisionRequest } from "../../src/types/decisions";
import { getDriveEffects } from "../../src/game/kickoff/driveEffects";
import { RerollDialog } from "../../src/ui/components/hud/RerollDialog";

/**
 * The team button names the re-roll it would spend, and is gone when the
 * team has none to spend, rather than offering "(0 left)".
 */
describe("RerollDialog team button", () => {
  let container: HTMLDivElement;
  let root: Root;
  let eventBus: EventBus;
  let teamId: string;

  beforeEach(() => {
    const game = new HeadlessGame({ seed: 1 });
    eventBus = new EventBus();
    ServiceContainer.initialize(eventBus, game.ctx.team1, game.ctx.team2);
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

  const showDodgeReroll = async (rerolls: number, free = 0) => {
    const service = ServiceContainer.getInstance().gameService;
    const team = service.getTeam(teamId)!;
    team.rerolls = rerolls;
    service.getState().turn.teamId = team.id;
    if (free) getDriveEffects(service.getState()).freeRerolls[team.id] = free;
    await act(async () => root.render(<RerollDialog eventBus={eventBus} />));
    const request: RerollDecisionRequest = {
      type: "reroll",
      playerId: team.players[0].id,
      chooserTeamId: team.id,
      rollKind: "dodge",
      sources: ["team", "veteran"],
      roll: 1,
    };
    await act(async () =>
      eventBus.emit(GameEventNames.DecisionRequested, request)
    );
    return container.querySelector('[data-testid="reroll-use-team"]');
  };

  it("leaves the team button out when the team has no re-rolls", async () => {
    expect(await showDodgeReroll(0)).toBeNull();
    expect(container.textContent).toContain("USE VETERAN RE-ROLL");
    expect(container.textContent).toContain("DECLINE");
  });

  it("counts the team's own re-rolls", async () => {
    expect((await showDodgeReroll(2))?.textContent).toBe(
      "USE TEAM RE-ROLL (2 left)"
    );
  });

  it("names the Leader re-roll when it is the next legal team source", async () => {
    const service = ServiceContainer.getInstance().gameService;
    const team = service.getTeam(teamId)!;
    team.players[0].gridPosition = { x: 5, y: 5 };
    team.players[0].skills.push(getSkill(SkillType.LEADER));
    service.getRerollArbiter().beginHalf([teamId]);
    expect((await showDodgeReroll(0))?.textContent).toBe("USE LEADER RE-ROLL");
  });

  it("names a free Brilliant Coaching re-roll instead of '0 left'", async () => {
    expect((await showDodgeReroll(0, 1))?.textContent).toBe(
      "USE BRILLIANT COACHING RE-ROLL"
    );
  });
});

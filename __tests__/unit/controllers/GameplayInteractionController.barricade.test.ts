import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { GameplayInteractionController } from "../../../src/game/controllers/GameplayInteractionController";
import {
  SEVENS_FORMAT,
  activateMatchFormat,
} from "../../../src/game/variants/activeMatch";
import { GamePhase } from "../../../src/types/GameState";
import { GameEventNames } from "../../../src/types/events";
import { fixtureValue } from "../../../src/testing/fixtureValue";
import { createTestPlayer } from "../../fixtures/players";
import { playerWith } from "./controllerFixtures";
import {
  createController,
  eventBusSpies,
  mockEventBus,
  mockGameService,
  mockMovementValidator,
  mockScene,
  serviceSpies,
  stateWith,
  team1Id,
} from "./GameplayInteractionController.setup";

const climber = createTestPlayer(
  playerWith({
    id: "p1",
    teamId: team1Id,
    gridPosition: { x: 10, y: 7 },
    playerName: "Climber",
    stats: { MA: 6 },
  })
);

async function answer(result: { confirmed: boolean; alternative?: true }) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  const ask = eventBusSpies.emit.mock.calls
    .findLast(([name]) => name === GameEventNames.UI_RequestConfirmation);
  const prompt = z
    .object({ actionId: z.string(), title: z.string() })
    .parse(fixtureValue(ask)[1]);
  mockEventBus.emit(GameEventNames.UI_ConfirmationResult, {
    ...result,
    actionId: prompt.actionId,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return prompt;
}

describe("crossing a barricade from the board", () => {
  let controller: GameplayInteractionController;

  beforeEach(() => {
    activateMatchFormat({ gameType: "gutter-bowl", venue: "gutter-sewer" });
    controller = createController();
    mockScene.team1 = { ...mockScene.team1, players: [climber] };
    mockGameService.getState.mockReturnValue(
      stateWith({ activeTeamId: team1Id, phase: GamePhase.PLAY })
    );
    mockGameService.getPlayerById.mockReturnValue(climber);
    mockGameService.getPhase.mockReturnValue(GamePhase.PLAY);
    mockGameService.getMovementUsed.mockReturnValue(0);
    mockMovementValidator.findPath.mockReturnValue({
      cost: 1,
      valid: true,
      path: [{ x: 11, y: 7 }],
      rolls: [],
    });
    controller.selectPlayer("p1");
    void controller.onSquareClicked(11, 7);
    void controller.onSquareClicked(11, 7);
  });

  afterEach(() => {
    activateMatchFormat(SEVENS_FORMAT);
  });

  it("asks the coach and climbs Safely on Climb Safely", async () => {
    const prompt = await answer({ confirmed: true });

    expect(prompt.title).toBe("Climber: Barricade");
    expect(serviceSpies.movePlayer).toHaveBeenCalledWith("p1", [
      { x: 11, y: 7 },
    ]);
  });

  it("marks the step Reckless on Go Recklessly", async () => {
    await answer({ confirmed: false, alternative: true });

    expect(serviceSpies.movePlayer).toHaveBeenCalledWith("p1", [
      { x: 11, y: 7, reckless: true },
    ]);
  });

  it("stops before the barricade on Stop here", async () => {
    await answer({ confirmed: false });

    expect(serviceSpies.movePlayer).not.toHaveBeenCalled();
  });
});

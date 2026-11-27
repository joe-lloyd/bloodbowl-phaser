import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameplayInteractionController } from "../../src/game/controllers/GameplayInteractionController";
import { MovementValidator } from "../../src/game/validators/MovementValidator";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { mockPitch, mockScene } from "../unit/controllers/GameplayInteractionController.setup";
import { type Scenario } from "../../src/types/Scenario";

const scenario: Scenario = {
  id: "mini-turn-board",
  name: "Charge! on the board",
  description: "Open teams ready for a team-one kick.",
  setup: {
    team1Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 5,
      y: playerIndex + 2,
    })),
    team2Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
      playerIndex,
      x: 14,
      y: playerIndex + 2,
    })),
    activeTeam: "team2",
    phase: GamePhase.KICKOFF,
    subPhase: SubPhase.ROLL_KICKOFF,
  },
};

async function kickedIntoCharge() {
  for (let seed = 1; seed < 800; seed++) {
    const game = new HeadlessGame({ scenario, seed });
    const dice = game.ctx.gameService.getDiceController();
    vi.spyOn(dice, "rollD3").mockReturnValue(3);
    const kicked = await game.execute({
      type: "kick-ball",
      playerId: fixtureValue(game.ctx.teams[0].players[0]).id,
      x: 14,
      y: 5,
    });
    const pending = kicked.pendingDecision;
    if (pending?.type === "kickoff-event" && pending.event === KickoffEvent.CHARGE)
      return game;
  }
  throw new Error("no seed rolls Charge!");
}

function board(game: HeadlessGame) {
  mockPitch.worldToGrid.mockImplementation((x: number, y: number) => ({ x, y }));
  return new GameplayInteractionController({
    scene: { ...mockScene, team1: game.ctx.teams[0], team2: game.ctx.teams[1] },
    gameService: game.ctx.gameService,
    eventBus: game.ctx.eventBus,
    pitch: mockPitch,
    movementValidator: new MovementValidator(),
  });
}

const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};

describe("Charge! played on the board", () => {
  it("lets the coach play all four picked players in an order of their own", async () => {
    const game = await kickedIntoCharge();
    const gs = game.ctx.gameService;
    const { eventBus } = game.ctx;
    const [team1] = game.ctx.teams;
    const controller = board(game);
    const picked = [1, 2, 3, 4].map((i) => fixtureValue(team1.players[i]));

    for (const player of picked) controller.handlePlayerClick(player.id);
    expect(gs.getKickoffEventStep()?.selectedPlayerIds).toHaveLength(4);
    gs.confirmKickoffEventStep();

    const moved: string[] = [];
    for (const index of [3, 0, 2, 1]) {
      const player = fixtureValue(picked[index]);
      const from = { ...fixtureValue(player.gridPosition) };
      controller.handlePlayerClick(player.id);
      eventBus.emit(GameEventNames.UI_ActionSelected, {
        action: "move",
        playerId: player.id,
      });
      const to = { x: from.x + 2, y: from.y };
      controller.handlePointerDown({ worldX: to.x, worldY: to.y }, false);
      controller.handlePointerDown({ worldX: to.x, worldY: to.y }, false);
      await settle();
      if (player.gridPosition?.x === to.x && player.gridPosition.y === to.y)
        moved.push(player.id);
      eventBus.emit(GameEventNames.UI_EndActivation, undefined);
      await settle();
    }

    expect(moved).toHaveLength(4);
    await vi.waitFor(() => {
      expect(gs.getKickoffEventStep()).toBeNull();
    });
    controller.destroy();
  });
});

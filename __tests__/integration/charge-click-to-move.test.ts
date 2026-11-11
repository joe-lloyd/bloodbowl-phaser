/**
 * Charge! on the board: the kicking coach picks chargers, presses Charge!,
 * picks Move in the action menu and clicks a square twice, the way the
 * browser plays it. Real engine, real interaction controller; only the
 * Phaser scene and pitch drawing are stubbed.
 *
 * Live site: chargers were selected and their paths were drawn, but the
 * click on the destination did nothing. The board asked whether the player
 * could activate in the turn on the ledger, and a Charge! runs before any
 * turn of the drive: at the opening kick-off that ledger belongs to no
 * team, and after a touchdown it holds the scoring turn's activations.
 */
import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameplayInteractionController } from "../../src/game/controllers/GameplayInteractionController";
import { MovementValidator } from "../../src/game/validators/MovementValidator";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { Scenario } from "../../src/types/Scenario";

const scenario = (activeTeam: "team1" | "team2"): Scenario => ({
  id: "charge-on-the-board",
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
    activeTeam,
    phase: GamePhase.KICKOFF,
    subPhase: SubPhase.ROLL_KICKOFF,
  },
});

async function kickedIntoCharge(activeTeam: "team1" | "team2") {
  for (let seed = 1; seed < 800; seed++) {
    const game = new HeadlessGame({ scenario: scenario(activeTeam), seed });
    const kicked = await game.execute({
      type: "kick-ball",
      playerId: game.ctx.team1.players[0].id,
      x: 14,
      y: 5,
    });
    const rolled = kicked.events.find((e) => e.name === "kickoffResult")
      ?.data as { event?: KickoffEvent } | undefined;
    if (rolled?.event === KickoffEvent.CHARGE) return game;
  }
  throw new Error("no seed rolls Charge!");
}

/** The controller on a stub scene whose world coordinates are grid squares. */
function board(game: HeadlessGame) {
  const pitch = new Proxy(
    {
      worldToGrid: (x: number, y: number) => ({ x, y }),
      highlightSquare: () => ({ destroy: () => {} }),
    } as Record<string, unknown>,
    {
      get: (target, key: string) => {
        if (!(key in target)) target[key] = vi.fn();
        return target[key];
      },
    }
  );
  const scene = {
    team1: game.ctx.team1,
    team2: game.ctx.team2,
    events: { on: vi.fn(), off: vi.fn() },
    highlightPlayer: vi.fn(),
    unhighlightPlayer: vi.fn(),
  };
  return new GameplayInteractionController(
    scene as never,
    game.ctx.gameService,
    game.ctx.eventBus,
    pitch as never,
    new MovementValidator()
  );
}

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

/** The ledgers a real kick-off can leave behind before Charge! runs. */
const LEDGERS = [
  {
    // The kick-off sandbox (and the browser test built on it) seeds this
    // one, which is why that test stayed green while live games broke
    name: "the kicking team's turn is on the ledger, nobody spent (sandbox)",
    activeTeam: "team1" as const,
    prepare: () => {},
  },
  {
    name: "the receiving team's turn is on the ledger",
    activeTeam: "team2" as const,
    prepare: () => {},
  },
  {
    name: "no team's turn is on the ledger (the opening kick-off)",
    activeTeam: "team2" as const,
    prepare: (game: HeadlessGame) => {
      game.ctx.gameService.getState().turn.teamId = "";
    },
  },
  {
    name: "the kicking team's scoring turn is on the ledger, chargers spent",
    activeTeam: "team1" as const,
    prepare: (game: HeadlessGame, chargers: string[]) => {
      const turn = game.ctx.gameService.getState().turn;
      for (const id of chargers) {
        turn.activatedPlayerIds.add(id);
        turn.movementUsed.set(id, 6);
      }
    },
  },
];

describe("Charge! click-to-move on the board", () => {
  it.each(LEDGERS)(
    "every charger moves when $name",
    async ({ activeTeam, prepare }) => {
      const game = await kickedIntoCharge(activeTeam);
      const gs = game.ctx.gameService;
      const { eventBus, team1, team2 } = game.ctx;
      const controller = board(game);
      const chargers = [team1.players[1].id, team1.players[3].id];
      prepare(game, chargers);
      // The action menu opens for whoever the board last selected
      let menuFor: string | null = null;
      eventBus.on(
        GameEventNames.PlayerSelected,
        (data: { player: { id: string } | null }) => {
          menuFor = data.player?.id ?? null;
        }
      );

      // Pick the chargers on the board, then press Charge!
      for (const id of chargers) controller.handlePlayerClick(id);
      expect(gs.getKickoffEventStep()?.selectedPlayerIds).toEqual(chargers);
      expect(gs.confirmKickoffEventStep()).toBe(true);

      for (const id of chargers) {
        expect(gs.getKickoffEventStep()?.charge?.activePlayerId).toBe(id);
        expect(menuFor).toBe(id);
        const player = gs.getPlayerById(id)!;
        const from = { ...player.gridPosition! };
        const to = { x: from.x + 2, y: from.y };

        eventBus.emit(GameEventNames.UI_ActionSelected, {
          action: "move",
          playerId: id,
        });
        // First click plots the route, the second walks it
        controller.handlePointerDown({ worldX: to.x, worldY: to.y }, false);
        controller.handlePointerDown({ worldX: to.x, worldY: to.y }, false);
        await settle();

        expect(gs.getPlayerById(id)!.gridPosition).toEqual(to);
        expect(gs.getMovementUsed(id)).toBe(2);
        eventBus.emit(GameEventNames.UI_EndActivation);
        await settle();
      }

      // The Charge is over and the drive starts on the receiving turn
      expect(game.pendingDecision()).toBeNull();
      expect(gs.getPhase()).toBe(GamePhase.PLAY);
      expect(gs.getState().activeTeamId).toBe(team2.id);
      // Charge! never spent the coming turn: the chargers still activate
      // when their own team's turn comes round
      expect(gs.getState().turn.activatedPlayerIds.size).toBe(0);
      controller.destroy();
    }
  );

  it("refuses a click-to-move for anyone but the charger up now", async () => {
    const game = await kickedIntoCharge("team2");
    const gs = game.ctx.gameService;
    const { team1, team2 } = game.ctx;
    const controller = board(game);
    const charger = team1.players[1].id;
    controller.handlePlayerClick(charger);
    gs.confirmKickoffEventStep();

    expect(gs.canActivate(charger)).toBe(true);
    // A team-mate who was not picked, and a receiving player whose turn
    // the stale ledger names, both wait
    expect(gs.canActivate(team1.players[2].id)).toBe(false);
    expect(gs.canActivate(team2.players[2].id)).toBe(false);
    controller.destroy();
  });

  it("hands a fresh, cancellable activation to the next charger when a move ends the last one", async () => {
    const game = await kickedIntoCharge("team1");
    const gs = game.ctx.gameService;
    const { eventBus, team1 } = game.ctx;
    const controller = board(game);
    const chargers = [team1.players[1].id, team1.players[3].id];
    for (const id of chargers) controller.handlePlayerClick(id);
    gs.confirmKickoffEventStep();

    // The engine ends an activation as part of a move once the player's
    // squares are spent (or they fall); here it ends on arrival, before the
    // board's own after-move step runs
    let ended = false;
    eventBus.on(GameEventNames.PlayerMoved, (data: { playerId: string }) => {
      if (!ended && data.playerId === chargers[0]) {
        ended = true;
        gs.finishActivation(chargers[0]);
      }
    });
    const movedInAction: string[] = [];
    eventBus.on(
      GameEventNames.PlayerMovedInAction,
      (data: { playerId: string }) => movedInAction.push(data.playerId)
    );

    const from = { ...gs.getPlayerById(chargers[0])!.gridPosition! };
    const to = { x: from.x + 2, y: from.y };
    eventBus.emit(GameEventNames.UI_ActionSelected, {
      action: "move",
      playerId: chargers[0],
    });
    controller.handlePointerDown({ worldX: to.x, worldY: to.y }, false);
    controller.handlePointerDown({ worldX: to.x, worldY: to.y }, false);
    await settle();

    expect(ended).toBe(true);
    expect(gs.getKickoffEventStep()?.charge?.activePlayerId).toBe(chargers[1]);
    // The next charger has not moved: nothing marks them as having moved,
    // and Back still returns them to the action menu
    expect(movedInAction).not.toContain(chargers[1]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    eventBus.emit(GameEventNames.UI_CancelAction);
    expect(warn).not.toHaveBeenCalledWith("Cannot cancel action after moving");
    warn.mockRestore();
    controller.destroy();
  });
});

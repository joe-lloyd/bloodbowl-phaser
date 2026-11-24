import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameplayInteractionController } from "../../src/game/controllers/GameplayInteractionController";
import { MovementValidator } from "../../src/game/validators/MovementValidator";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { type Scenario } from "../../src/types/Scenario";
import { KickoffPhaseHandler } from "../../src/game/controllers/handlers/KickoffPhaseHandler";
import type { BlockRollData } from "../../src/services/BlockResolutionService";

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
      playerId: fixtureValue(game.ctx.team1.players[0]).id,
      x: 14,
      y: 5,
    });
    const rolled = kicked.events.find((e) => e.name === "kickoffResult")
      ?.data as { event?: KickoffEvent } | undefined;
    if (rolled?.event === KickoffEvent.CHARGE) return game;
  }
  throw new Error("no seed rolls Charge!");
}

function board(game: HeadlessGame) {
  const members: Record<string, unknown> = {
    worldToGrid: (x: number, y: number) => ({ x, y }),
    highlightSquare: () => ({ destroy: () => {} }),
  };
  const pitch = new Proxy(members, {
    get: (target, key: string) => {
      if (!(key in target)) target[key] = vi.fn();
      return target[key];
    },
  });
  const scene = {
    team1: game.ctx.team1,
    team2: game.ctx.team2,
    events: { on: vi.fn(), off: vi.fn() },
    highlightPlayer: vi.fn(),
    unhighlightPlayer: vi.fn(),
  };
  return new GameplayInteractionController({
    scene: scene as never,
    gameService: game.ctx.gameService,
    eventBus: game.ctx.eventBus,
    pitch: pitch as never,
    movementValidator: new MovementValidator(),
  });
}

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

const LEDGERS = [
  {
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
      const chargers = [
        fixtureValue(team1.players[1]).id,
        fixtureValue(team1.players[3]).id,
      ];
      prepare(game, chargers);

      let menuFor: string | null = null;
      eventBus.on(
        GameEventNames.PlayerSelected,
        (data: { player: { id: string } | null }) => {
          menuFor = data.player?.id ?? null;
        }
      );

      for (const id of chargers) controller.handlePlayerClick(id);
      expect(gs.getKickoffEventStep()?.selectedPlayerIds).toEqual(chargers);
      expect(gs.confirmKickoffEventStep()).toBe(true);

      for (const id of chargers) {
        expect(gs.getKickoffEventStep()?.charge?.activePlayerId).toBe(id);
        expect(menuFor).toBe(id);
        const player = fixtureValue(gs.getPlayerById(id));
        const from = { ...fixtureValue(player.gridPosition) };
        const to = { x: from.x + 2, y: from.y };

        eventBus.emit(GameEventNames.UI_ActionSelected, {
          action: "move",
          playerId: id,
        });

        controller.handlePointerDown({ worldX: to.x, worldY: to.y }, false);
        controller.handlePointerDown({ worldX: to.x, worldY: to.y }, false);
        await settle();

        expect(fixtureValue(gs.getPlayerById(id)).gridPosition).toEqual(to);
        expect(gs.getMovementUsed(id)).toBe(2);
        eventBus.emit(GameEventNames.UI_EndActivation, undefined);
        await settle();
      }

      expect(game.pendingDecision()).toBeNull();
      expect(gs.getPhase()).toBe(GamePhase.PLAY);
      expect(gs.getState().activeTeamId).toBe(team2.id);

      expect(gs.getState().turn.activatedPlayerIds.size).toBe(0);
      controller.destroy();
    }
  );

  it("refuses a click-to-move for anyone but the charger up now", async () => {
    const game = await kickedIntoCharge("team2");
    const gs = game.ctx.gameService;
    const { team1, team2 } = game.ctx;
    const controller = board(game);
    const charger = fixtureValue(team1.players[1]).id;
    controller.handlePlayerClick(charger);
    gs.confirmKickoffEventStep();

    expect(gs.canActivate(charger)).toBe(true);

    expect(gs.canActivate(fixtureValue(team1.players[2]).id)).toBe(false);
    expect(gs.canActivate(fixtureValue(team2.players[2]).id)).toBe(false);
    controller.destroy();
  });

  it("hands a fresh, cancellable activation to the next charger when a move ends the last one", async () => {
    const game = await kickedIntoCharge("team1");
    const gs = game.ctx.gameService;
    const { eventBus, team1 } = game.ctx;
    const controller = board(game);
    const chargers = [
      fixtureValue(team1.players[1]).id,
      fixtureValue(team1.players[3]).id,
    ];
    for (const id of chargers) controller.handlePlayerClick(id);
    gs.confirmKickoffEventStep();

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

    const from = {
      ...fixtureValue(
        fixtureValue(gs.getPlayerById(fixtureValue(chargers[0]))).gridPosition
      ),
    };
    const to = { x: from.x + 2, y: from.y };
    eventBus.emit(GameEventNames.UI_ActionSelected, {
      action: "move",
      playerId: fixtureValue(chargers[0]),
    });
    controller.handlePointerDown({ worldX: to.x, worldY: to.y }, false);
    controller.handlePointerDown({ worldX: to.x, worldY: to.y }, false);
    await settle();

    expect(ended).toBe(true);
    expect(gs.getKickoffEventStep()?.charge?.activePlayerId).toBe(chargers[1]);

    expect(movedInAction).not.toContain(chargers[1]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    eventBus.emit(GameEventNames.UI_CancelAction, undefined);
    expect(warn).not.toHaveBeenCalledWith("Cannot cancel action after moving");
    warn.mockRestore();
    controller.destroy();
  });
});

describe("Charge! Blitz block from the block dialog", () => {
  it("rolls the dice and applies the picked result during KICKOFF", async () => {
    const game = await kickedIntoCharge("team2");
    const gs = game.ctx.gameService;
    const { eventBus, team1, team2 } = game.ctx;
    const attacker = team1.players[1];
    const defender = team2.players[1];
    await game.execute({
      type: "kickoff-select-player",
      playerId: fixtureValue(attacker).id,
    });
    await game.execute({ type: "kickoff-confirm" });

    fixtureValue(attacker).gridPosition = { x: 9, y: 5 };
    fixtureValue(defender).gridPosition = { x: 10, y: 5 };
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "blitz",
    });
    expect(gs.getState().activePlayer?.id).toBe(fixtureValue(attacker).id);
    const handler = new KickoffPhaseHandler(
      { playerSprites: new Map(), pitch: { clearKickTarget: vi.fn() } } as never,
      gs,
      eventBus
    );
    handler.enter();
    const rolls: BlockRollData[] = [];
    eventBus.on(GameEventNames.BlockDiceRolled, (roll) => rolls.push(roll));

    eventBus.emit(GameEventNames.UI_RollBlockDice, {
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
      numDice: 1,
      isAttackerChoice: true,
    });
    await settle();

    expect(gs.getPhase()).toBe(GamePhase.KICKOFF);
    expect(rolls).toHaveLength(1);
    expect(fixtureValue(rolls[0]).attackerId).toBe(fixtureValue(attacker).id);
    expect(game.pendingDecision()?.type).toBe("block-dice");

    eventBus.emit(GameEventNames.UI_BlockResultSelected, {
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
      result: fixtureValue(fixtureValue(rolls[0]).results[0]),
    });
    await settle();
    expect(game.pendingDecision()?.type).not.toBe("block-dice");
    handler.exit();
  });
});

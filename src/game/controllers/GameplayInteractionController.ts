import Phaser from "phaser";
import { GameScene } from "../../scenes/GameScene";
import { IGameService } from "../../services/interfaces/IGameService";
import { Pitch } from "../elements/Pitch";
import { MovementValidator } from "../validators/MovementValidator";
import { pixelToGrid } from "../elements/GridUtils";
import { GamePhase, SubPhase } from "../../types/GameState";
import { IEventBus } from "../../services/EventBus";
import { Player } from "@/types";
import { GameEventNames } from "@/types/events";
import { HighlightManager } from "../managers/HighlightManager";
import { PassController } from "./PassController";

export class GameplayInteractionController {
  private scene: GameScene;
  private gameService: IGameService;
  private eventBus: IEventBus;
  private pitch: Pitch;
  private movementValidator: MovementValidator;
  private highlightManager: HighlightManager;

  // State
  private selectedPlayerId: string | null = null;
  private lastHoverGrid: { x: number; y: number } | null = null;
  private waypoints: { x: number; y: number }[] = [];
  private pendingMove: {
    playerId: string;
    path: { x: number; y: number }[];
  } | null = null;

  // Push direction selection state
  private pushSelectionActive: boolean = false;
  private pushValidDirections: { x: number; y: number }[] = [];
  private pushDefenderId: string = "";
  private pushAttackerId: string = ""; // Track attacker ID
  private pushResultType: string = "";

  // Store handler references for cleanup
  private pushDirectionHandler: (data) => void;
  private pendingDodgeSquares: { x: number; y: number; modifiers: number }[] =
    [];

  // Pass mode state
  private currentActionMode: import("@/types/events").ActionType | null = null;
  private currentStepId: string | null = null;
  private actionSteps: { id: string; label: string }[] = [];
  private hasMovedInAction: boolean = false;
  private passController: PassController;

  constructor(
    scene: GameScene,
    gameService: IGameService,
    eventBus: IEventBus,
    pitch: Pitch,
    movementValidator: MovementValidator
  ) {
    this.scene = scene;
    this.gameService = gameService;
    this.eventBus = eventBus;
    this.pitch = pitch;
    this.movementValidator = movementValidator;
    this.highlightManager = new HighlightManager(pitch);
    this.passController = new PassController(eventBus);

    // Store handler reference for cleanup
    this.pushDirectionHandler = (data) => {
      this.startPushDirectionSelection(data);
    };

    // Listen for confirmation
    this.eventBus.on(
      GameEventNames.UI_ConfirmationResult,
      this.onConfirmationResult
    );

    // Listen for push direction selection request
    this.eventBus.on(
      GameEventNames.UI_SelectPushDirection,
      this.pushDirectionHandler
    );

    // Listen for player actions (Blitz, Stand Up)
    this.eventBus.on(GameEventNames.UI_ActionSelected, this.onActionSelected);
    this.eventBus.on(GameEventNames.UI_StepSelected, this.onStepSelected);
  }

  private onStepSelected = (data: { stepId: string }) => {
    // Validate step exists in current sequence
    const stepExists = this.actionSteps.some((s) => s.id === data.stepId);
    if (!stepExists) {
      console.warn("Invalid step selected:", data.stepId);
      return;
    }

    this.currentStepId = data.stepId;
    console.log(`Switched action step to: ${data.stepId}`);

    // Force refresh of hover state to update visualization
    if (this.lastHoverGrid) {
      this.onSquareHovered(this.lastHoverGrid.x, this.lastHoverGrid.y);
    } else {
      // Clear visuals if no hover
      this.pitch.clearPassVisualization();
      this.pitch.clearPath();
      if (data.stepId === "move" && this.selectedPlayerId) {
        this.selectPlayer(this.selectedPlayerId); // Re-draw move overlay
      }
    }
  };

  private onActionSelected = async (data: {
    action: import("@/types/events").ActionType;
    playerId: string;
  }) => {
    // Immediate Actions
    if (data.action === "standUp") {
      try {
        await this.gameService.standUp(data.playerId);
        this.selectPlayer(data.playerId);
      } catch (err) {
        console.error("Stand Up failed:", err);
        this.eventBus.emit(
          GameEventNames.UI_Notification,
          `Cannot Stand Up: ${err}`
        );
      }
      return;
    }

    if (data.action === "forgoe") {
      this.gameService.finishActivation(data.playerId);
      this.deselectPlayer();
      return;
    }

    // Mode-Setting Actions (Blitz, Pass, Move, etc.)
    const success = this.gameService.declareAction(data.playerId, data.action);
    if (success) {
      // Set action mode state
      this.currentActionMode = data.action;
      this.hasMovedInAction = false;

      // Define steps based on action
      this.actionSteps = [];
      const defaultStep = "move";

      switch (data.action) {
        case "pass":
          this.actionSteps = [
            { id: "move", label: "Move" },
            { id: "pass", label: "Pass" },
          ];
          break;
        case "blitz":
          this.actionSteps = [
            { id: "move", label: "Move" },
            { id: "block", label: "Block" },
          ];
          break;
        case "handoff":
          this.actionSteps = [
            { id: "move", label: "Move" },
            { id: "handoff", label: "Handoff" },
          ];
          break;
        case "foul":
          this.actionSteps = [
            { id: "move", label: "Move" },
            { id: "foul", label: "Foul" },
          ];
          break;
        case "throwTeamMate":
          this.actionSteps = [
            { id: "move", label: "Move" },
            { id: "ttm", label: "Throw Team Mate" },
          ];
          break;
        // Secure Ball logic? Usually automatic, but stepper requested.
        case "secureBall":
          this.actionSteps = [
            { id: "move", label: "Move" },
            { id: "secure", label: "Secure Ball" },
          ];
          break;
        default:
          // Single step actions (Move)
          this.actionSteps = [{ id: "move", label: "Move" }];
          break;
      }

      this.currentStepId = defaultStep;

      // Emit Step Info
      this.eventBus.emit(GameEventNames.UI_UpdateActionSteps, {
        steps: this.actionSteps,
        currentStepId: this.currentStepId,
      });

      // Emit ActionModeChanged event for UI (Legacy?)
      this.eventBus.emit(GameEventNames.ActionModeChanged, {
        playerId: data.playerId,
        action: data.action,
        autoSelectMove: true,
      });

      // Don't call selectPlayer here - it causes PlayerSelected event
      // which resets the action mode we just set!
      // The player is already selected, no need to refresh
    } else {
      console.log("Failed to declare action:", data.action);
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        `Cannot declare ${data.action} (Already used?)`
      );
    }
  };

  public handlePointerDown(
    pointer: Phaser.Input.Pointer,
    isSetupActive: boolean
  ): void {
    if (isSetupActive) return;

    const { valid, gridX, gridY } = this.getGridFromPointer(pointer);
    if (valid) {
      this.onSquareClicked(gridX, gridY);
    } else {
      // Clicked outside pitch -> Deselect
      this.deselectPlayer();
    }
  }

  public handlePointerMove(
    pointer: Phaser.Input.Pointer,
    isSetupActive: boolean
  ): void {
    if (isSetupActive) return;

    const { valid, gridX, gridY } = this.getGridFromPointer(pointer);
    if (valid) {
      // Optimize: Only update if grid changed
      if (
        !this.lastHoverGrid ||
        this.lastHoverGrid.x !== gridX ||
        this.lastHoverGrid.y !== gridY
      ) {
        this.lastHoverGrid = { x: gridX, y: gridY };
        this.onSquareHovered(gridX, gridY);
      }
    } else {
      this.lastHoverGrid = null;
      this.pitch.clearHover();
      this.pitch.clearPath();
      this.eventBus.emit(GameEventNames.UI_HidePlayerInfo);
    }
  }

  private getGridFromPointer(pointer: Phaser.Input.Pointer): {
    valid: boolean;
    gridX: number;
    gridY: number;
  } {
    const pitchContainer = this.pitch.getContainer();
    const localX = pointer.x - pitchContainer.x;
    const localY = pointer.y - pitchContainer.y;

    const pitchW = 26 * 60;
    const pitchH = 15 * 60;

    if (localX >= 0 && localX <= pitchW && localY >= 0 && localY <= pitchH) {
      const gridPos = pixelToGrid(localX, localY, 60);
      return { valid: true, gridX: gridPos.x, gridY: gridPos.y };
    }
    return { valid: false, gridX: -1, gridY: -1 };
  }

  private onSquareClicked(x: number, y: number): void {
    // Check if we're selecting a push direction first
    if (this.handlePushDirectionClick(x, y)) {
      return; // Push direction was selected, done
    }

    const phase = this.gameService.getPhase();
    const playerAtSquare = this.getPlayerAt(x, y);

    // KICKOFF PHASE
    if (phase === GamePhase.KICKOFF) {
      this.handleKickoffClick(x, y, playerAtSquare);
      return;
    }

    // PASS Execution (if in pass aiming mode)
    if (
      this.currentActionMode === "pass" &&
      this.currentStepId === "pass" &&
      this.selectedPlayerId
    ) {
      if (playerAtSquare && playerAtSquare.id === this.selectedPlayerId) {
        // Clicked self while passing -> Cancel / Switch back to move?
        // Or just ignore. Let's ignore for now.
        return;
      }

      // Execute Pass
      this.gameService.throwBall(this.selectedPlayerId, x, y);
      return;
    }

    // PLAY PHASE
    if (playerAtSquare) {
      // Clicking ANOTHER player?
      if (playerAtSquare.id !== this.selectedPlayerId) {
        // BLOCK CHECK
        if (this.selectedPlayerId) {
          const selectedPlayer = this.gameService.getPlayerById(
            this.selectedPlayerId
          );
          const state = this.gameService.getState();

          if (
            selectedPlayer &&
            state.activeTeamId === selectedPlayer.teamId &&
            this.gameService.canActivate(selectedPlayer.id) &&
            selectedPlayer.teamId !== playerAtSquare.teamId
          ) {
            // Check Adjacency
            const dx = Math.abs((selectedPlayer.gridPosition?.x || 0) - x);
            const dy = Math.abs((selectedPlayer.gridPosition?.y || 0) - y);

            if (dx <= 1 && dy <= 1) {
              // IT'S A BLOCK!

              // Implicit Action Declaration
              // Only check current action if it's for THIS player
              const currentAction =
                state.activePlayer?.id === selectedPlayer.id
                  ? state.activePlayer?.action
                  : undefined;

              if (!currentAction) {
                // If no action declared for this player, implicitly declare BLOCK
                this.gameService.declareAction(selectedPlayer.id, "block");
              } else if (currentAction === "move") {
                // Cannot block if Move declared (unless Blitz, handled below)
                this.eventBus.emit(
                  GameEventNames.UI_Notification,
                  "Cannot Block during Move action (need Blitz)"
                );
                return;
              }

              // Deselect player to clear movement path/highlights
              this.deselectPlayer();
              // Trigger Block Preview
              this.gameService.previewBlock(
                selectedPlayer.id,
                playerAtSquare.id
              );
              return;
            }
          }
        }

        // If not a block, select them (inspection)
        this.selectPlayer(playerAtSquare.id);
      } else {
        // Clicking SELF?
        // Confirm logic (unchanged)
      }
    } else if (this.selectedPlayerId) {
      // Empty Square Click
      const player = this.gameService.getPlayerById(this.selectedPlayerId);
      const state = this.gameService.getState();

      // Only allow movement planning if active team and player can activate
      if (
        player &&
        state.activeTeamId === player.teamId &&
        this.gameService.canActivate(player.id)
      ) {
        // Implicit Action Declaration
        // Only check current action if it's for THIS player
        const currentAction =
          state.activePlayer?.id === player.id
            ? state.activePlayer?.action
            : undefined;

        if (!currentAction) {
          // If no action declared for this player, implicitly declare MOVE
          this.gameService.declareAction(player.id, "move");
        } else if (currentAction === "block") {
          this.eventBus.emit(
            GameEventNames.UI_Notification,
            "Cannot Move during Block action"
          );
          return;
        }

        // Check if clicking the LAST added waypoint (or current pos if none) -> CONFIRM
        const lastPos =
          this.waypoints.length > 0
            ? this.waypoints[this.waypoints.length - 1]
            : player.gridPosition;

        if (lastPos && lastPos.x === x && lastPos.y === y) {
          // CONFIRM MOVE
          this.executeMove();
        } else {
          // ADD WAYPOINT
          this.addWaypoint(x, y);
        }
      } else {
        this.deselectPlayer();
      }
    } else {
      this.deselectPlayer(); // Clicking empty space with no selection
    }
  }

  private onSquareHovered(x: number, y: number): void {
    // 1. Highlight Square Cursor
    this.pitch.highlightHoverSquare(x, y);

    // 2. Player Info
    const player = this.getPlayerAt(x, y);
    if (player) {
      this.eventBus.emit(GameEventNames.UI_ShowPlayerInfo, player);
    } else {
      this.eventBus.emit(GameEventNames.UI_HidePlayerInfo);
    }

    // 3. Movement Path
    if (this.selectedPlayerId && !player) {
      // Check if in pass mode AND pass step
      if (this.currentActionMode === "pass" && this.currentStepId === "pass") {
        const selectedPlayer = this.gameService.getPlayerById(
          this.selectedPlayerId
        );
        if (selectedPlayer && selectedPlayer.gridPosition) {
          // Draw pass zones
          const ranges = this.passController.getAllRanges(
            selectedPlayer.gridPosition
          );
          this.pitch.drawPassZones(selectedPlayer.gridPosition, ranges);

          // Draw pass line to cursor
          const passRange = this.passController.measureRange(
            selectedPlayer.gridPosition,
            { x, y }
          );
          this.pitch.drawPassLine(
            selectedPlayer.gridPosition,
            { x, y },
            passRange.type
          );
        }
      } else {
        // Normal movement path (Move mode or default)
        // Only draw if NOT in pass sub-action
        this.drawPath(x, y);
      }
    } else {
      this.pitch.clearPath();
      this.pitch.clearPassVisualization();
    }
  }

  public selectPlayer(playerId: string): void {
    const state = this.gameService.getState();
    const player = this.gameService.getPlayerById(playerId);

    if (!player) return;

    // Interaction Check: Only active team's turn?
    // User asked: "only the player in control can move their own pieces".
    // Allow selection for inspection at any time, but movement only if active.
    const canActivate = this.gameService.canActivate(playerId);

    // Check for previous incomplete activation
    // If another player was partially moved, we must finish them before selecting a new one.
    // Or, more strictly: selecting a NEW player implies ending the previous player's turn if they moved.
    if (this.selectedPlayerId && this.selectedPlayerId !== playerId) {
      const prevUsed = this.gameService.getMovementUsed(this.selectedPlayerId);
      const prevActed = this.gameService.hasPlayerActed(this.selectedPlayerId);

      // If they used movement but aren't marked as acted rigid, mark them now.
      if (prevUsed > 0 && !prevActed) {
        this.gameService.finishActivation(this.selectedPlayerId);
      }
    }

    this.deselectPlayer();
    this.selectedPlayerId = playerId;

    const isOwnTurn = state.activeTeamId === player.teamId;

    // Visual highlight
    this.scene.highlightPlayer(playerId);

    // UI Selection Event
    this.eventBus.emit(GameEventNames.PlayerSelected, { player });

    // Show Movement Range & Tackle Zones if own turn AND can activate
    if (isOwnTurn && canActivate) {
      // Only show movement range if NOT in pass mode
      if (this.currentActionMode !== "pass") {
        const reachable = this.gameService.getAvailableMovements(playerId);

        // Calculate remaining SAFE MA (for overlay coloring)
        let used = this.gameService.getMovementUsed(playerId);

        // If prone, they need to spend 3 MA to stand (or all MA if less than 3)
        if (player.status === "Prone") {
          const standUpCost = Math.min(3, player.stats.MA);
          used += standUpCost;
        }

        const remainingSafeMA = Math.max(0, player.stats.MA - used);

        // Separate into Safe (<= RemainingMA) and Sprint (> RemainingMA)
        const safeMoves: { x: number; y: number }[] = [];
        const sprintMoves: { x: number; y: number }[] = [];

        reachable.forEach((move) => {
          if (move.cost !== undefined && move.cost > remainingSafeMA) {
            sprintMoves.push(move);
          }
          // All are "reachable" for the overlay to NOT be dark
          safeMoves.push(move);
        });

        // Show Overlay (Inverse of ALL reachable)
        this.pitch.drawRangeOverlay(reachable);

        // Show Sprint Risks
        this.pitch.drawSprintRisks(sprintMoves);
      }

      // Show Tackle Zones (always show these, even in pass mode)
      // Get all opposing players with tackle zones (standing, not stunned/prone)
      const opponents = this.getOpposingPlayers(player.teamId);
      const tackleZones: { x: number; y: number }[] = [];

      opponents.forEach((op) => {
        if (op.status === "Active" && op.gridPosition) {
          // Assuming 'Active' implies standing
          // Add 8 squares around
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              if (dx === 0 && dy === 0) continue;
              const tx = op.gridPosition.x + dx;
              const ty = op.gridPosition.y + dy;
              // Check bounds (0-25, 0-14)
              if (tx >= 0 && tx < 26 && ty >= 0 && ty < 15) {
                tackleZones.push({ x: tx, y: ty });
              }
            }
          }
        }
      });
      this.pitch.drawTackleZones(tackleZones);
    }
  }

  public deselectPlayer(): void {
    if (this.selectedPlayerId) {
      this.scene.unhighlightPlayer(this.selectedPlayerId);
      this.selectedPlayerId = null;
    }
    this.waypoints = [];
    this.clearAllInteractionHighlights();

    // Reset action mode state
    this.currentActionMode = null;
    this.currentStepId = null;
    this.actionSteps = [];
    this.hasMovedInAction = false;
    this.pitch.clearPassVisualization();

    // Notify UI
    this.eventBus.emit(GameEventNames.PlayerSelected, { player: null }); // OR add explicit deselect event
  }

  private addWaypoint(x: number, y: number): void {
    if (!this.selectedPlayerId) return;
    const player = this.gameService.getPlayerById(this.selectedPlayerId);
    if (!player) return;

    // Get Path for this segment
    const startPos =
      this.waypoints.length > 0
        ? this.waypoints[this.waypoints.length - 1]
        : player.gridPosition!;

    // Use pathfinder for this segment (smart pathing between clicks)
    const team =
      player.teamId === this.getSceneTeam1().id
        ? this.getSceneTeam1()
        : this.getSceneTeam2();
    const opponentTeam =
      player.teamId === this.getSceneTeam1().id
        ? this.getSceneTeam2()
        : this.getSceneTeam1();

    const opponents = opponentTeam.players.filter((p) => p.gridPosition);
    const teammates = team.players.filter(
      (p) => p.gridPosition && p.id !== player.id
    );
    const mockPlayer = { ...player, gridPosition: startPos };

    const result = this.movementValidator.findPath(
      mockPlayer,
      x,
      y,
      opponents,
      teammates
    );

    if (result.valid) {
      // Add path to waypoints (excluding start, including end)
      // Result.path includes the steps.

      // Check TOTAL path length limit (Remaining MA + 2)
      const used = this.gameService.getMovementUsed(player.id);
      const totalAllowance = player.stats.MA + 2;
      const remainingAllowance = Math.max(0, totalAllowance - used);

      const currentLen = this.waypoints.length;
      const newLen = currentLen + result.path.length;

      if (newLen <= remainingAllowance) {
        this.waypoints.push(...result.path);
        this.drawCurrentPath();
      } else {
        console.warn("Path too long!", { newLen, remainingAllowance, used });
        // Feedback?
      }
    }
  }

  private executeMove(): void {
    if (!this.selectedPlayerId || this.waypoints.length === 0) return;

    const player = this.gameService.getPlayerById(this.selectedPlayerId);
    if (!player) return;

    // Check for dodge requirements
    const fullPath = [
      { x: player.gridPosition!.x, y: player.gridPosition!.y },
      ...this.waypoints,
    ];

    const opponents = this.getOpposingPlayers(player.teamId).filter(
      (p) => p.gridPosition && p.status === "Active"
    );

    const dodgeAnalysis = this.movementValidator.analyzePath(
      player,
      fullPath,
      opponents
    );

    if (dodgeAnalysis.requiresDodge) {
      const dodgeSquares = dodgeAnalysis.dodgeSquares;
      const worstModifier = Math.min(...dodgeSquares.map((d) => d.modifiers));
      const dodgeCount = dodgeSquares.length;

      this.pendingMove = {
        playerId: this.selectedPlayerId,
        path: [...this.waypoints],
      };

      this.eventBus.emit(GameEventNames.UI_RequestConfirmation, {
        actionId: "dodge-confirm",
        title: "Dodge Required!",
        message:
          `This move requires ${dodgeCount} dodge roll${
            dodgeCount > 1 ? "s" : ""
          }.\n` +
          `Target: ${player.stats.AG}+ (Worst modifier: ${worstModifier})\n` +
          `Failing a dodge causes a Fall & Turnover.\n\n` +
          `Do you want to attempt the dodge?`,
        confirmLabel: "Dodge!",
        cancelLabel: "Cancel",
        risky: true,
      });
      return;
    }

    // No dodge required, check for sprint
    this.checkSprintOrFinalize(this.selectedPlayerId, this.waypoints);
  }

  private finalizeMove(
    playerId: string,
    path: { x: number; y: number }[]
  ): void {
    this.gameService
      .movePlayer(playerId, path)
      .then(() => {
        // Do NOT auto-finish activation here.
        // Allow partial moves. GameService will auto-finish if MA+2 is used.
        // this.gameService.finishActivation(playerId);

        // Do NOT deselect if still active.
        // If activation NOT finished, keep selected?
        // How do we know from here?
        // Check canActivate? canActivate is TRUE until finished.

        // If we used all movement, it should be finished.
        // If GameService finished it, we should deselect.
        // Listener for 'playerActivated' handles visual update, but DESELECTION?

        // If player is still legally active/selected, we keep them selected for next move.
        // If we deselect, user has to re-select. That's annoying for partial moves.

        // If player IS activated, deselect.
        if (this.gameService.hasPlayerActed(playerId)) {
          this.deselectPlayer();
        } else {
          // Keep selected, clear waypoints so they can plot next "leg"
          this.waypoints = [];
          this.pitch.clearPath();

          // Track that player has moved in this action
          if (this.currentActionMode === "pass" && !this.hasMovedInAction) {
            this.hasMovedInAction = true;
            this.eventBus.emit(GameEventNames.PlayerMovedInAction, {
              playerId,
              canPass: true,
            });
          }

          // REFRESH SELECTION logic to update the Range Overlay
          // calling selectPlayer again will re-fetch available movements (which now include used)
          this.selectPlayer(playerId);
        }

        this.pendingMove = null;
      })
      .catch((err) => {
        console.error("Move failed", err);
        this.deselectPlayer();
        this.pendingMove = null;
      });
  }

  public destroy(): void {
    // Cleanup listeners
    this.eventBus.off(
      GameEventNames.UI_ConfirmationResult,
      this.onConfirmationResult
    );
    this.eventBus.off(
      GameEventNames.UI_SelectPushDirection,
      this.pushDirectionHandler
    );
    this.eventBus.off(GameEventNames.UI_ActionSelected, this.onActionSelected);
    this.eventBus.off(GameEventNames.UI_StepSelected, this.onStepSelected);

    // Cleanup highlight manager
    if (this.highlightManager) {
      this.highlightManager.destroy();
    }
  }

  private onConfirmationResult = (data: {
    confirmed: boolean;
    actionId: string;
  }) => {
    // Handle dodge confirmation
    if (data.actionId === "dodge-confirm") {
      if (data.confirmed && this.pendingMove) {
        // Continue to sprint check or finalize
        this.checkSprintOrFinalize(
          this.pendingMove.playerId,
          this.pendingMove.path
        );
      } else {
        this.pendingMove = null;
      }
      return;
    }

    if (data.actionId === "sprint-confirm") {
      if (data.confirmed && this.pendingMove) {
        this.finalizeMove(this.pendingMove.playerId, this.pendingMove.path);
      } else {
        // Canceled
        this.pendingMove = null;
      }
    }
  };

  // Extract sprint check logic
  private checkSprintOrFinalize(
    playerId: string,
    path: { x: number; y: number }[]
  ): void {
    const player = this.gameService.getPlayerById(playerId);
    if (!player) return;

    const totalSteps = path.length;
    const used = this.gameService.getMovementUsed(player.id);
    const ma = player.stats.MA;
    const remainingSafeMA = Math.max(0, ma - used);

    if (totalSteps > remainingSafeMA) {
      const extraSteps = totalSteps - remainingSafeMA;

      this.pendingMove = { playerId, path };

      this.eventBus.emit(GameEventNames.UI_RequestConfirmation, {
        actionId: "sprint-confirm",
        title: "Sprint Required! (GFI)",
        message:
          `This move goes ${extraSteps} square(s) beyond MA.\n` +
          `You must roll a 2+ for each extra square.\n` +
          `Rolling a 1 causes a Fall & Turnover.\n\n` +
          `Do you want to Sprint?`,
        confirmLabel: "Sprint!",
        cancelLabel: "Cancel",
        risky: true,
      });
    } else {
      this.finalizeMove(playerId, path);
    }
  }

  private drawCurrentPath(): void {
    if (!this.selectedPlayerId) return;

    // We need to calculate rolls for the FULL path to visualize correctly
    // Recalculate rolls based on full sequence
    // This is a bit heavy but ensures correct visualization (dodge/gfi)

    // TODO: Use a validator helper to "Analyze Path"
    // For now, simple draw
    const player = this.gameService.getPlayerById(this.selectedPlayerId);
    if (player && player.gridPosition) {
      const fullPath = [
        { x: player.gridPosition.x, y: player.gridPosition.y },
        ...this.waypoints,
      ];
      this.pitch.drawMovementPath(fullPath, [], player.stats.MA);
    }
  }

  private drawPath(x: number, y: number): void {
    if (!this.selectedPlayerId) return;
    const player = this.gameService.getPlayerById(this.selectedPlayerId);
    if (!player) return;

    // Don't draw preview if not active team
    const state = this.gameService.getState();
    if (state.activeTeamId !== player.teamId) return;

    // Start from last waypoint
    const startPos =
      this.waypoints.length > 0
        ? this.waypoints[this.waypoints.length - 1]
        : player.gridPosition!;

    // Find path for segment
    const team =
      player.teamId === this.getSceneTeam1().id
        ? this.getSceneTeam1()
        : this.getSceneTeam2();
    const opponentTeam =
      player.teamId === this.getSceneTeam1().id
        ? this.getSceneTeam2()
        : this.getSceneTeam1();

    const opponents = opponentTeam.players.filter((p) => p.gridPosition);
    const teammates = team.players.filter(
      (p) => p.gridPosition && p.id !== player.id
    );

    const mockPlayer = { ...player, gridPosition: startPos };
    const result = this.movementValidator.findPath(
      mockPlayer,
      x,
      y,
      opponents,
      teammates
    );

    if (result.valid) {
      // Combine confirmed waypoints + preview path
      // ALSO include the player's current position as the start of the visual path
      const fullPath = [
        { x: player.gridPosition!.x, y: player.gridPosition!.y },
        ...this.waypoints,
        ...result.path,
      ];
      // TODO: Get rolls for full path
      this.pitch.drawMovementPath(fullPath, [], player.stats.MA);
    } else {
      // Just draw existing waypoints if preview is invalid
      if (this.waypoints.length > 0) {
        const fullPath = [
          { x: player.gridPosition!.x, y: player.gridPosition!.y },
          ...this.waypoints,
        ];
        this.pitch.drawMovementPath(fullPath, [], player.stats.MA);
      } else {
        this.pitch.clearPath();
      }
    }
  }

  private handleKickoffClick(x: number, y: number, playerAtSquare): void {
    const subPhase = this.gameService.getSubPhase();

    if (subPhase === SubPhase.SETUP_KICKOFF) {
      // If clicking on a player
      if (playerAtSquare) {
        // If own player -> Select/Switch Kicker
        const kickingTeam = this.scene.kickingTeam;
        if (playerAtSquare.teamId === kickingTeam.id) {
          // Unhighlight previous if exists
          if (
            this.selectedPlayerId &&
            this.selectedPlayerId !== playerAtSquare.id
          ) {
            this.scene.unhighlightPlayer(this.selectedPlayerId);
          }

          this.selectedPlayerId = playerAtSquare.id;
          this.scene.highlightPlayer(playerAtSquare.id);
          this.gameService.selectKicker(playerAtSquare.id);
          this.eventBus.emit(
            GameEventNames.UI_Notification,
            "Kicker Selected! Now choose target."
          );
          return;
        }
      }

      // If clicking on a square (Target)
      // Validate Target (Must be opponent half)
      const isTeam1Kicking = this.scene.kickingTeam.id === this.scene.team1.id;
      // Pitch width 20, minus the end zones its 18, divided by 3
      // team one setup is 1-7, no mans land is 8-13, team two setup is 14-20
      const isOpponentHalf = isTeam1Kicking ? x >= 7 : x <= 13;

      if (!isOpponentHalf) {
        // If they clicked an empty square in their own half
        if (this.selectedPlayerId) {
          this.eventBus.emit(
            GameEventNames.UI_Notification,
            "Kick to opponent's half!"
          );
        }
        return;
      }

      // If we have a selected kicker and clicked opponent half -> KICK!
      if (this.selectedPlayerId) {
        this.gameService.kickBall(this.selectedPlayerId, x, y);
        this.selectedPlayerId = null; // Clear selection after kick
      } else {
        this.eventBus.emit(
          GameEventNames.UI_Notification,
          "Select a Kicker first!"
        );
      }
    }
  }

  private getPlayerAt(x: number, y: number): Player | null {
    const t1 = this.getSceneTeam1();
    const t2 = this.getSceneTeam2();
    const players = [...t1.players, ...t2.players];

    return (
      players.find((p) => p.gridPosition?.x === x && p.gridPosition?.y === y) ||
      null
    );
  }

  // Helpers to access Scene data (temporary until full decouple)
  private getSceneTeam1() {
    return this.scene.team1;
  }
  private getSceneTeam2() {
    return this.scene.team2;
  }

  private getOpposingPlayers(
    myTeamId: string
  ): import("../../types/Player").Player[] {
    const t1 = this.getSceneTeam1();
    const t2 = this.getSceneTeam2();
    return myTeamId === t1.id ? t2.players : t1.players;
  }

  /**
   * Start push direction selection mode
   */
  private startPushDirectionSelection(data): void {
    this.pushSelectionActive = true;
    this.pushValidDirections = data.validDirections || [];
    this.pushDefenderId = data.defenderId;
    this.pushAttackerId = data.attackerId || ""; // Store attacker ID
    this.pushResultType = data.resultType || "";

    // Clear any existing highlights first
    this.clearAllInteractionHighlights();

    // Highlight the valid push squares using HighlightManager
    this.pushValidDirections.forEach((dir) => {
      this.highlightManager.addPushHighlight(dir.x, dir.y, 0xffff00);
    });
  }

  /**
   * Handle click on a push direction square
   */
  private handlePushDirectionClick(x: number, y: number): boolean {
    if (!this.pushSelectionActive) return false;

    const isValid = this.pushValidDirections.some(
      (dir) => dir.x === x && dir.y === y
    );

    if (isValid) {
      this.gameService.executePush(
        this.pushAttackerId,
        this.pushDefenderId,
        { x, y },
        this.pushResultType,
        false
      );

      this.pushSelectionActive = false;
      this.pushValidDirections = [];
      this.pushDefenderId = "";
      this.pushAttackerId = "";
      this.pushResultType = "";

      this.clearAllInteractionHighlights();

      return true;
    }
    return false;
  }

  /**
   * Clear all interaction-managed highlights (push, selection, etc.)
   * Also clears pitch-managed highlights for comprehensive cleanup
   */
  public clearAllInteractionHighlights(): void {
    // Clear all highlights managed by HighlightManager
    this.highlightManager.clearAllHighlights();
  }
}

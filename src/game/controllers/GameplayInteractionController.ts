import Phaser from "phaser";
import { GameScene } from "../../scenes/GameScene";
import { IGameService } from "../../services/interfaces/IGameService";
import { Pitch } from "../elements/Pitch";
import { MovementValidator } from "../validators/MovementValidator";
import { moveAllowance } from "../skills/movement";
import { pixelToGrid } from "../elements/GridUtils";
import { jumpTargets, JumpTarget } from "../rules/jump";
import { GameConfig } from "../../config/GameConfig";
import { GamePhase, SubPhase } from "../../types/GameState";
import { IEventBus } from "../../services/EventBus";
import { Player, PlayerStatus, hasTackleZone } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import { GameEventNames } from "@/types/events";
import { HighlightManager } from "../managers/HighlightManager";
import { PassController } from "./PassController";
import {
  isRightStuffEligible,
  isThrowTeammateInRange,
} from "../rules/throwTeammate";
import { getActiveOnlineMatch } from "../../network/OnlineMatch";
import { KickoffEvent } from "../kickoff/kickoffEvents";
import {
  BlockReplacement,
  BLOCK_REPLACEMENT_DEFINITIONS,
  blockReplacementForDirectAction,
} from "../../types/BlockReplacement";
import { legalBlockReplacementTargets } from "../rules/blockReplacements";

/**
 * Special activation actions that target a single adjacent Standing
 * opponent. Declaring one enters a "target" step; clicking a valid target
 * runs it through the matching IGameService call.
 */
const SPECIAL_ACTION_MODES = new Set<string>([
  "stab",
  "breatheFire",
  "vomit",
  "gaze",
  "chomp",
  "chainsaw",
]);

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
  private pushDirectionHandler: (
    data: import("@/types/events").UIEvents[GameEventNames.UI_SelectPushDirection]
  ) => void;
  private resumeBlitzMoveHandler: (data: { playerId: string }) => void;
  private kickoffHighlightedPlayerIds = new Set<string>();
  private kickoffStepSyncHandler = () => this.syncKickoffStepInteraction();
  private kickoffPlayerSelectedHandler = (data: { player: Player | null }) => {
    const step = this.gameService.getKickoffEventStep();
    if (!step) return;
    if (
      step.charge?.activePlayerId &&
      data.player?.id === step.charge.activePlayerId
    ) {
      if (
        this.selectedPlayerId &&
        this.selectedPlayerId !== step.charge.activePlayerId
      ) {
        this.scene.unhighlightPlayer(this.selectedPlayerId);
      }
      this.selectedPlayerId = step.charge.activePlayerId;
      this.currentActionMode = null;
      this.currentStepId = null;
      this.actionSteps = [];
      this.waypoints = [];
      this.hasMovedInAction = false;
      this.pitch.clearPath();
      this.pitch.clearPassVisualization();
    }
    this.syncKickoffStepInteraction();
  };

  // Pass mode state
  private currentActionMode: import("@/types/events").ActionType | null = null;
  /** Explicit direct/Blitz attack declaration retained through movement. */
  private currentBlockReplacement: BlockReplacement | null = null;
  private currentStepId: string | null = null;
  private actionSteps: { id: string; label: string }[] = [];
  private hasMovedInAction: boolean = false;
  /**
   * The Jump step is selected: a click Jumps two squares in the compass
   * direction toward the pointer. A separate flag (not currentStepId) so the
   * Move step is never marked "done" — a Jump does not consume the Move.
   */
  private jumpTargeting: boolean = false;
  /** The team-mate chosen for a Throw / Kick Team-mate Action, awaiting an aim. */
  private ttmTeammateId: string | null = null;
  /** First opponent selected for a Multiple Block, awaiting the second. */
  private multipleBlockFirstTargetId: string | null = null;
  private passController: PassController;

  // Interaction Lock
  private isBusy: boolean = false;

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
    this.passController = gameService.getPassController();

    // Store handler reference for cleanup
    this.pushDirectionHandler = (data) => {
      this.startPushDirectionSelection(data);
    };

    // A Blitz block that left movement re-enters the move: re-select the
    // blitzer where the follow-up left them, with the rest of their MA (and
    // Rush) available. Their one Block is spent, so only Move remains.
    this.resumeBlitzMoveHandler = (data) => {
      const player = this.gameService.getPlayerById(data.playerId);
      if (!player || this.gameService.hasPlayerActed(data.playerId)) return;
      this.selectedPlayerId = data.playerId;
      this.currentActionMode = "blitz";
      this.currentStepId = "move";
      this.hasMovedInAction = true;
      this.waypoints = [];
      this.pitch.clearPath();
      this.scene.highlightPlayer(data.playerId);
      this.eventBus.emit(GameEventNames.PlayerSelected, { player });
      this.eventBus.emit(GameEventNames.UI_UpdateActionSteps, {
        steps: [{ id: "move", label: "Move" }],
        currentStepId: "move",
      });
      this.refreshPlayerVisualization(data.playerId);
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
    this.eventBus.on(GameEventNames.UI_CancelAction, this.onCancelAction);
    this.eventBus.on(GameEventNames.UI_EndActivation, this.onEndActivation);
    this.eventBus.on(
      GameEventNames.UI_ResumeBlitzMove,
      this.resumeBlitzMoveHandler
    );
    this.eventBus.on(
      GameEventNames.KickoffEventStepStarted,
      this.kickoffStepSyncHandler
    );
    this.eventBus.on(
      GameEventNames.KickoffEventStepResolved,
      this.kickoffStepSyncHandler
    );
    this.eventBus.on(GameEventNames.UI_SyncBoard, this.kickoffStepSyncHandler);
    this.eventBus.on(GameEventNames.PlayerMoved, this.kickoffStepSyncHandler);
    this.eventBus.on(GameEventNames.PlayerPlaced, this.kickoffStepSyncHandler);
    this.eventBus.on(GameEventNames.PlayerRemoved, this.kickoffStepSyncHandler);
    this.eventBus.on(
      GameEventNames.PlayerSelected,
      this.kickoffPlayerSelectedHandler
    );

    // Leaving PLAY (touchdown, drive end, halftime) must fully reset the
    // interaction state — a lingering selection/action menu/overlay broke
    // setting up the next drive
    this.eventBus.on(GameEventNames.PhaseChanged, this.onPhaseChangedReset);
  }

  private onPhaseChangedReset = (data: { phase: GamePhase }) => {
    if (data.phase === GamePhase.PLAY) {
      return;
    }
    this.pendingMove = null;
    this.pushSelectionActive = false;
    this.pushValidDirections = [];
    this.pushDefenderId = "";
    this.pushAttackerId = "";
    this.pushResultType = "";
    this.isBusy = false;
    this.deselectPlayer();
    this.pitch.clearHover();
  };

  private onEndActivation = () => {
    if (this.selectedPlayerId) {
      this.gameService.finishActivation(this.selectedPlayerId);
      this.deselectPlayer();
    }
  };

  private onCancelAction = () => {
    if (!this.selectedPlayerId) return;

    // If we have already moved, we cannot fully cancel the action to select another player
    // effectively, we can only "End Activation" or continue.
    // BUT the requirement says: "if the player misclicked it they should be able to exit by pressing the back button"
    // AND "if a player moves then they can no longer go back to the context menu"

    if (this.hasMovedInAction) {
      // If moved, Back might just deselect current step or do nothing?
      // The requirement says "can no longer go back to the context menu".
      // So maybe Back is disabled in UI?
      // If UI emits this, let's treat it as deselecting ONLY if we haven't moved?
      console.warn("Cannot cancel action after moving");
      return;
    }

    // Determine what to go back to.
    // If we are in an Action (like Pass) and haven't moved, "Back" should probably cancel the Action Mode
    // and return to "Just Selected" state (Action Menu open).

    if (!this.gameService.cancelAction(this.selectedPlayerId)) {
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        "This Action is already committed and cannot be cancelled."
      );
      return;
    }

    // Reset Action Mode but keep player selected
    this.currentActionMode = null;
    this.currentBlockReplacement = null;
    this.currentStepId = null;
    this.actionSteps = [];
    this.pitch.clearPassVisualization();

    // Notify UI to show default menu again
    // We do this by emitting PlayerSelected again (which resets menu in PlayerActionMenu)
    const player = this.gameService.getPlayerById(this.selectedPlayerId);
    if (player) {
      this.eventBus.emit(GameEventNames.PlayerSelected, { player });

      // Also need to refresh visuals (ranges might have been hidden/changed)
      this.refreshPlayerVisualization(this.selectedPlayerId);
    }
  };

  private onStepSelected = (data: { stepId: string }) => {
    // Validate step exists in current sequence
    const stepExists = this.actionSteps.some((s) => s.id === data.stepId);
    if (!stepExists) {
      console.warn("Invalid step selected:", data.stepId);
      return;
    }

    // Stand Up executes immediately and hands over to the action's next step
    if (data.stepId === "standup" && this.selectedPlayerId) {
      const playerId = this.selectedPlayerId;
      this.gameService
        .standUp(playerId)
        .then(() => {
          // A Jump Up player standing to make a declared Block must pass an
          // Agility test; on a failure they are still Prone and the Action is
          // spent, so there is no next step to advance to.
          const after = this.gameService.getPlayerById(playerId);
          if (after?.status !== PlayerStatus.ACTIVE) {
            this.deselectPlayer();
            return;
          }
          this.actionSteps = this.actionSteps.filter((s) => s.id !== "standup");
          // Advance to whatever the action's own next step is — a Block
          // action has no "move" step, so assuming one stranded it.
          this.currentStepId = this.actionSteps[0]?.id ?? "move";
          this.eventBus.emit(GameEventNames.UI_UpdateActionSteps, {
            steps: this.actionSteps,
            currentStepId: this.currentStepId,
          });
          this.refreshPlayerVisualization(playerId);
        })
        .catch((err) => {
          this.eventBus.emit(
            GameEventNames.UI_Notification,
            `Cannot Stand Up: ${err}`
          );
        });
      return;
    }

    // Jump step: enter Jump targeting — a snapped two-square arrow follows the
    // pointer and a click leaps in that compass direction. Kept OFF of
    // currentStepId (the Move step stays current, never marked done) since a
    // Jump does not consume the Move.
    if (data.stepId === "jump" && this.selectedPlayerId) {
      this.jumpTargeting = true;
      const player = this.gameService.getPlayerById(this.selectedPlayerId);
      const targets = player ? this.computeJumpTargets(player) : [];
      if (player?.gridPosition) {
        this.pitch.drawJumpTargets(player.gridPosition, targets);
      }
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        targets.length > 0
          ? "Jump: click a highlighted landing square to leap over the player."
          : "No adjacent player to Jump over."
      );
      return;
    }

    // Any other step ends Jump targeting.
    this.jumpTargeting = false;
    this.currentStepId = data.stepId;
    this.eventBus.emit(GameEventNames.UI_UpdateActionSteps, {
      steps: this.actionSteps,
      currentStepId: this.currentStepId,
    });
    console.log(`Switched action step to: ${data.stepId}`);

    // 1. Refresh static visuals (range overlay, tackle zones) for the new step
    if (this.selectedPlayerId) {
      this.refreshPlayerVisualization(this.selectedPlayerId);
    }

    // 2. Refresh dynamic visuals (cursor, path, pass lines)
    if (this.lastHoverGrid) {
      this.onSquareHovered(this.lastHoverGrid.x, this.lastHoverGrid.y);
    } else {
      // Clear dynamic visuals if no hover (path, cursor)
      // Static visuals already handled above
      this.pitch.clearPassVisualization();
      this.pitch.clearPath();
    }
  };

  private onActionSelected = async (data: {
    action: import("@/types/events").ActionType;
    playerId: string;
    blockReplacement?: BlockReplacement;
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
    const blockReplacement =
      data.blockReplacement ??
      blockReplacementForDirectAction(data.action) ??
      null;
    const success = this.gameService.declareAction(
      data.playerId,
      data.action,
      blockReplacement ?? undefined
    );
    if (success) {
      // Set action mode state
      this.currentActionMode = data.action;
      this.currentBlockReplacement = blockReplacement;
      this.hasMovedInAction = false;

      // Define steps based on action
      this.actionSteps = [];

      switch (data.action) {
        case "stab":
        case "breatheFire":
        case "vomit":
        case "gaze":
        case "chomp":
        case "chainsaw":
          // Single-target special action: pick an adjacent Standing opponent
          this.actionSteps = [{ id: "target", label: "Select Target" }];
          break;
        case "pass":
          this.actionSteps = [
            { id: "move", label: "Move" },
            { id: "pass", label: "Pass" },
          ];
          break;
        case "punt":
          this.actionSteps = [
            { id: "move", label: "Move" },
            { id: "punt", label: "Punt (pick direction)" },
          ];
          break;
        case "throwBomb":
          // A Bomber may not Move before throwing: one step, aim at any square.
          this.actionSteps = [{ id: "bomb", label: "Throw Bomb" }];
          break;
        case "ballAndChain":
          // The Fanatic's only action: pick a facing (a click direction).
          this.actionSteps = [
            { id: "swing", label: "Swing (pick a direction)" },
          ];
          break;
        case "blitz":
          this.actionSteps = blockReplacement
            ? [
                { id: "move", label: "Move" },
                {
                  id: "target",
                  label: BLOCK_REPLACEMENT_DEFINITIONS[blockReplacement].label,
                },
              ]
            : [
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
        case "block":
          // A standalone Block: pick an adjacent Standing opponent to block.
          this.actionSteps = [{ id: "block", label: "Block" }];
          break;
        case "multipleBlock":
          this.multipleBlockFirstTargetId = null;
          this.actionSteps = [
            { id: "multipleBlock", label: "Select Two Targets" },
          ];
          break;
        case "throwTeamMate":
          this.ttmTeammateId = null;
          // Move first (optional), then throw: in the throw step the first
          // click picks the adjacent Right-Stuff team-mate, the second aims.
          this.actionSteps = [
            { id: "move", label: "Move" },
            { id: "throw", label: "Throw Team-mate" },
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
          // Move: walk by clicking squares, or Jump over an adjacent downed
          // player via the Jump step (you can jump at any point in the move).
          this.actionSteps = [
            { id: "move", label: "Move" },
            { id: "jump", label: "Jump" },
          ];
          break;
      }

      // The opening step is always the action's own first step. Deriving it
      // from the list (rather than assuming "move") keeps single-step actions
      // — Block, Throw Bomb, Ball & Chain, the special attacks — on a step
      // their click handler actually matches; a hard-coded "move" left them
      // on a step no branch claimed, so their clicks fell through.
      const defaultStep = this.actionSteps[0]?.id ?? "move";

      // A prone player stands up first — same activation, costs movement
      const declarer = this.gameService.getPlayerById(data.playerId);
      if (declarer?.status === PlayerStatus.PRONE) {
        this.actionSteps.unshift({ id: "standup", label: "Stand Up" });
        this.currentStepId = "standup";
      } else {
        this.currentStepId = defaultStep;
      }

      // Emit Step Info
      this.eventBus.emit(GameEventNames.UI_UpdateActionSteps, {
        steps: this.actionSteps,
        currentStepId: this.currentStepId,
      });

      // Emit ActionModeChanged event for UI (Legacy?)
      this.eventBus.emit(GameEventNames.ActionModeChanged, {
        playerId: data.playerId,
        action: data.action,
        blockReplacement: blockReplacement ?? undefined,
        autoSelectMove: true,
      });

      // Don't call selectPlayer here - it causes PlayerSelected event
      // which resets the action mode we just set!
      // The player is already selected, no need to refresh

      // Update visuals to reflect new mode (e.g. Pass might hide movement range or show pass zones)
      this.refreshPlayerVisualization(data.playerId);
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
    // Online: input is locked while the opponent owns the turn/decision
    if (getActiveOnlineMatch()?.mayAct() === false) return;

    // Crowd push squares sit one square off-pitch; accept clicks there
    // while a push direction is being chosen
    const margin = this.pushSelectionActive ? 1 : 0;
    const { valid, gridX, gridY } = this.getGridFromPointer(pointer, margin);
    if (valid) {
      this.onSquareClicked(gridX, gridY);
    } else if (!this.pushSelectionActive) {
      // Clicked outside pitch -> Deselect (but never mid push decision:
      // deselecting would wipe the pending push highlights)
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

  private getGridFromPointer(
    pointer: Phaser.Input.Pointer,
    marginSquares: number = 0
  ): {
    valid: boolean;
    gridX: number;
    gridY: number;
  } {
    const pitchContainer = this.pitch.getContainer();
    const localX = pointer.x - pitchContainer.x;
    const localY = pointer.y - pitchContainer.y;

    const pitchW = 26 * 60;
    const pitchH = 15 * 60;
    const m = marginSquares * 60;

    if (
      localX >= -m &&
      localX <= pitchW + m &&
      localY >= -m &&
      localY <= pitchH + m
    ) {
      const gridPos = pixelToGrid(localX, localY, 60);
      return { valid: true, gridX: gridPos.x, gridY: gridPos.y };
    }
    return { valid: false, gridX: -1, gridY: -1 };
  }

  private async onSquareClicked(x: number, y: number): Promise<void> {
    if (this.isBusy) return;

    // Check if we're selecting a push direction first
    if (this.handlePushDirectionClick(x, y)) {
      return; // Push direction was selected, done
    }
    if (this.pushSelectionActive) {
      return; // Push direction is a mandatory decision: ignore other clicks
    }

    const phase = this.gameService.getPhase();
    const playerAtSquare = this.getPlayerAt(x, y);

    // JUMP TARGETING: while the Jump step is selected, any click Jumps two
    // squares in the compass direction toward the pointer — regardless of what
    // is under the cursor.
    if (this.jumpTargeting && this.selectedPlayerId) {
      await this.handleJumpClick(x, y);
      return;
    }

    // KICKOFF PHASE
    if (phase === GamePhase.KICKOFF) {
      const kickoffStep = this.gameService.getKickoffEventStep();
      if (!kickoffStep?.charge?.activePlayerId) {
        this.handleKickoffClick(x, y, playerAtSquare);
        return;
      }
    }

    // TOUCHBACK: the receiving coach must hand the ball to one of their
    // players before anything else happens
    if (this.gameService.isTouchbackPending()) {
      if (
        playerAtSquare &&
        this.gameService.awardTouchback(playerAtSquare.id)
      ) {
        return;
      }
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        "Touchback: select one of your standing players to take the ball."
      );
      return;
    }

    // PASS Execution (if in pass aiming mode)
    if (this.currentActionMode === "pass") {
      console.log(
        `[Interaction] onSquareClicked: Pass Mode Detected. Step: ${this.currentStepId}, Selected: ${this.selectedPlayerId}`
      );
    }

    // PASS / HAND-OFF Execution (aiming step). A hand-off is resolved through
    // the same throwBall path — PassOperation reads the declared action to
    // apply the Quick-Pass/hand-off catch rules — so both complete here
    // rather than reselecting the clicked team-mate.
    if (
      ((this.currentActionMode === "pass" && this.currentStepId === "pass") ||
        (this.currentActionMode === "handoff" &&
          this.currentStepId === "handoff")) &&
      this.selectedPlayerId
    ) {
      console.log(
        `[Interaction] Attempting ${this.currentActionMode} Execution...`
      );
      if (playerAtSquare && playerAtSquare.id === this.selectedPlayerId) {
        return;
      }
      this.isBusy = true;
      try {
        await this.gameService.throwBall(this.selectedPlayerId, x, y);
      } finally {
        this.isBusy = false;
        this.deselectPlayer();
      }
      return;
    }

    // PUNT: click a square to choose the Throw-in Template facing.
    if (
      this.currentActionMode === "punt" &&
      this.currentStepId === "punt" &&
      this.selectedPlayerId
    ) {
      const punter = this.gameService.getPlayerById(this.selectedPlayerId);
      if (!punter?.gridPosition) return;
      const facingX = Math.sign(x - punter.gridPosition.x);
      const facingY = Math.sign(y - punter.gridPosition.y);
      if (facingX === 0 && facingY === 0) return;
      this.isBusy = true;
      try {
        await this.gameService.puntBall(
          this.selectedPlayerId,
          facingX,
          facingY
        );
      } finally {
        this.isBusy = false;
        this.deselectPlayer();
      }
      return;
    }

    // MULTIPLE BLOCK: select two different adjacent Standing opponents.
    if (
      this.currentActionMode === "multipleBlock" &&
      this.currentStepId === "multipleBlock" &&
      this.selectedPlayerId
    ) {
      const attacker = this.gameService.getPlayerById(this.selectedPlayerId);
      const target = playerAtSquare;
      const adjacent =
        !!attacker?.gridPosition &&
        !!target?.gridPosition &&
        Math.max(
          Math.abs(attacker.gridPosition.x - target.gridPosition.x),
          Math.abs(attacker.gridPosition.y - target.gridPosition.y)
        ) === 1;
      if (
        !attacker ||
        !target ||
        target.teamId === attacker.teamId ||
        target.status !== PlayerStatus.ACTIVE ||
        !adjacent
      ) {
        this.eventBus.emit(
          GameEventNames.UI_Notification,
          "Select an adjacent Standing opponent."
        );
        return;
      }
      if (!this.multipleBlockFirstTargetId) {
        this.multipleBlockFirstTargetId = target.id;
        this.eventBus.emit(
          GameEventNames.UI_Notification,
          "First target selected — choose a different adjacent opponent."
        );
        return;
      }
      if (this.multipleBlockFirstTargetId === target.id) return;
      this.isBusy = true;
      try {
        await this.gameService.multipleBlock(
          this.selectedPlayerId,
          this.multipleBlockFirstTargetId,
          target.id
        );
      } finally {
        this.isBusy = false;
        this.multipleBlockFirstTargetId = null;
        this.deselectPlayer();
      }
      return;
    }

    // THROW BOMB Execution (Bombardier): click any square to lob the bomb.
    if (
      this.currentActionMode === "throwBomb" &&
      this.currentStepId === "bomb" &&
      this.selectedPlayerId
    ) {
      if (playerAtSquare && playerAtSquare.id === this.selectedPlayerId) {
        return;
      }
      this.isBusy = true;
      try {
        await this.gameService.throwBomb(this.selectedPlayerId, x, y);
      } finally {
        this.isBusy = false;
        this.deselectPlayer();
      }
      return;
    }

    // BALL & CHAIN Execution (Fanatic): the click picks a facing — a cardinal
    // direction (an End Zone or a Sideline) — and the Fanatic lurches off.
    if (
      this.currentActionMode === "ballAndChain" &&
      this.currentStepId === "swing" &&
      this.selectedPlayerId
    ) {
      const fanatic = this.gameService.getPlayerById(this.selectedPlayerId);
      if (!fanatic?.gridPosition) return;
      const facingX = Math.sign(x - fanatic.gridPosition.x);
      const facingY = Math.sign(y - fanatic.gridPosition.y);
      if (facingX === 0 && facingY === 0) {
        this.eventBus.emit(
          GameEventNames.UI_Notification,
          "Click a square in the direction to swing."
        );
        return;
      }
      this.isBusy = true;
      try {
        await this.gameService.ballAndChain(
          this.selectedPlayerId,
          facingX,
          facingY
        );
      } finally {
        this.isBusy = false;
        this.deselectPlayer();
      }
      return;
    }

    // THROW / KICK TEAM-MATE: clicking a valid target team-mate (adjacent,
    // Standing, Right-Stuff) selects it as the throw target and jumps to the
    // aim step — even directly from the Move step, so a direct click on the
    // target works without first switching to the Throw step. Once a target
    // is chosen, the next click aims at a Quick/Short-range square.
    if (this.currentActionMode === "throwTeamMate" && this.selectedPlayerId) {
      const thrower = this.gameService.getPlayerById(this.selectedPlayerId);
      if (!this.ttmTeammateId) {
        const mate = playerAtSquare;
        const adjacent =
          !!thrower?.gridPosition &&
          Math.abs(thrower.gridPosition.x - x) <= 1 &&
          Math.abs(thrower.gridPosition.y - y) <= 1;
        const validTarget =
          !!mate &&
          !!thrower &&
          mate.id !== thrower.id &&
          mate.teamId === thrower.teamId &&
          mate.status === PlayerStatus.ACTIVE &&
          adjacent &&
          isRightStuffEligible(mate);
        if (validTarget) {
          this.ttmTeammateId = mate!.id;
          if (this.currentStepId !== "throw") {
            this.currentStepId = "throw";
            this.eventBus.emit(GameEventNames.UI_UpdateActionSteps, {
              steps: this.actionSteps,
              currentStepId: this.currentStepId,
            });
          }
          this.eventBus.emit(
            GameEventNames.UI_Notification,
            `Aim ${mate!.playerName}'s throw — click a Quick/Short-range square.`
          );
          return;
        }
        // No valid target on this square. In the aim step tell the coach what
        // to click; in the Move step let the click fall through to movement.
        if (this.currentStepId === "throw") {
          this.eventBus.emit(
            GameEventNames.UI_Notification,
            "Select an adjacent Right Stuff team-mate (ST 3 or less)!"
          );
          return;
        }
      } else {
        // A team-mate has been chosen — this click is the aim square.
        if (
          thrower?.gridPosition &&
          !isThrowTeammateInRange(thrower.gridPosition, { x, y })
        ) {
          this.eventBus.emit(
            GameEventNames.UI_Notification,
            "Out of range — a team-mate can only be thrown to Quick or Short range!"
          );
          return;
        }
        this.isBusy = true;
        try {
          await this.gameService.throwTeammate(
            this.selectedPlayerId,
            this.ttmTeammateId,
            x,
            y
          );
        } finally {
          this.isBusy = false;
          this.ttmTeammateId = null;
          this.deselectPlayer();
        }
        return;
      }
    }

    // FOUL Execution. A Foul may move first, so during the Move step an empty
    // square still falls through to movement — but a click on ANY player is
    // claimed here, at either step. Without that, a coach who declared a Foul
    // and went straight for the victim (still on the Move step) fell through
    // to the implicit-Block path and got the block dice dialog instead.
    if (
      this.currentActionMode === "foul" &&
      this.selectedPlayerId &&
      (this.currentStepId === "foul" || playerAtSquare)
    ) {
      if (playerAtSquare && playerAtSquare.id === this.selectedPlayerId) {
        return;
      }

      if (
        playerAtSquare &&
        (playerAtSquare.status === PlayerStatus.PRONE ||
          playerAtSquare.status === PlayerStatus.STUNNED)
      ) {
        this.isBusy = true;
        try {
          await this.gameService.foulPlayer(this.selectedPlayerId, x, y);
        } finally {
          this.isBusy = false;
          this.deselectPlayer();
        }
      } else {
        this.eventBus.emit(
          GameEventNames.UI_Notification,
          "Target must be Prone or Stunned!"
        );
      }
      return;
    }

    // SPECIAL ACTION Execution, including an explicitly declared Blitz
    // replacement retained through movement.
    if (
      this.currentActionMode &&
      (SPECIAL_ACTION_MODES.has(this.currentActionMode) ||
        (this.currentActionMode === "blitz" &&
          this.currentBlockReplacement !== null)) &&
      this.currentStepId === "target" &&
      this.selectedPlayerId
    ) {
      const mode = this.currentActionMode;
      const replacement =
        this.currentBlockReplacement ?? blockReplacementForDirectAction(mode);
      const attackerId = this.selectedPlayerId;
      const attacker = this.gameService.getPlayerById(attackerId);
      if (playerAtSquare && playerAtSquare.id === attackerId) {
        return;
      }
      const adjacent =
        !!attacker?.gridPosition &&
        Math.abs(attacker.gridPosition.x - x) <= 1 &&
        Math.abs(attacker.gridPosition.y - y) <= 1;
      if (
        playerAtSquare &&
        attacker &&
        playerAtSquare.teamId !== attacker.teamId &&
        playerAtSquare.status === PlayerStatus.ACTIVE &&
        adjacent
      ) {
        this.isBusy = true;
        try {
          if (replacement === "stab") {
            await this.gameService.stabPlayer(attackerId, playerAtSquare.id);
          } else if (replacement) {
            await this.gameService.performSpecialAction(
              replacement,
              attackerId,
              playerAtSquare.id
            );
          } else {
            await this.gameService.performSpecialAction(
              mode as "gaze",
              attackerId,
              playerAtSquare.id
            );
          }
        } finally {
          this.isBusy = false;
          this.deselectPlayer();
        }
      } else {
        this.eventBus.emit(
          GameEventNames.UI_Notification,
          "Target must be an adjacent Standing opponent!"
        );
      }
      return;
    }

    // BLITZ Execution (Block Step)
    if (
      this.currentActionMode === "blitz" &&
      this.currentStepId === "block" &&
      this.selectedPlayerId
    ) {
      if (playerAtSquare && playerAtSquare.id !== this.selectedPlayerId) {
        // Initiate Block
        this.isBusy = true;
        // Don't wait for preview? Preview is sync usually?
        // Actually previewBlock just emits an event for UI to show dialog.
        // It doesn't need a lock usually, but deselectPlayer does cleanup.
        this.gameService.previewBlock(this.selectedPlayerId, playerAtSquare.id);

        this.deselectPlayer();
        this.isBusy = false;
        return;
      } else if (!playerAtSquare) {
        // Clicked empty space in Block mode?
        // ...
      }
    }

    // PLAY PHASE
    if (playerAtSquare) {
      // Clicking ANOTHER player?
      if (playerAtSquare.id !== this.selectedPlayerId) {
        // BLOCK CHECK — only for modes that actually mean to Block: nothing
        // declared (the implicit shortcut), a declared standalone Block, or a
        // Blitz still in its move. Every other action mode must have claimed
        // this click already; letting them reach here is how a declared Foul
        // (and any future targeted action) decayed into a block dice dialog.
        const mayBlockFromHere =
          this.currentActionMode === null ||
          this.currentActionMode === "block" ||
          this.currentActionMode === "blitz";

        if (this.selectedPlayerId && mayBlockFromHere) {
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

              // A Blitz allows only one Block; after it, further clicks move.
              if (this.gameService.hasUsedBlitzBlock(selectedPlayer.id)) {
                this.eventBus.emit(
                  GameEventNames.UI_Notification,
                  "This Blitz has already used its Block \u2014 keep moving."
                );
                return;
              }

              // A declared, unspent block-replacing attack is what a target
              // click resolves \u2014 never a Block. The declaration is read from
              // the authoritative state (not the local step), so a re-selected
              // player, a guest, and the host all take the same path.
              const declaredReplacement =
                state.activePlayer?.id === selectedPlayer.id &&
                !state.activePlayer.blockReplacementUsed
                  ? state.activePlayer.blockReplacement
                  : undefined;

              if (declaredReplacement) {
                const label =
                  BLOCK_REPLACEMENT_DEFINITIONS[declaredReplacement].label;
                const legalTarget =
                  legalBlockReplacementTargets(
                    selectedPlayer,
                    [playerAtSquare],
                    declaredReplacement
                  ).length > 0;
                if (!legalTarget) {
                  // Refuse by name: downgrading to a Block would spend the
                  // one attack on something the coach did not choose. The
                  // declaration and the remaining movement are untouched.
                  this.eventBus.emit(
                    GameEventNames.UI_Notification,
                    `${label} cannot target ${playerAtSquare.playerName} \u2014 keep moving or end the activation.`
                  );
                  return;
                }
                this.isBusy = true;
                try {
                  if (declaredReplacement === "stab") {
                    await this.gameService.stabPlayer(
                      selectedPlayer.id,
                      playerAtSquare.id
                    );
                  } else {
                    await this.gameService.performSpecialAction(
                      declaredReplacement,
                      selectedPlayer.id,
                      playerAtSquare.id
                    );
                  }
                } finally {
                  this.isBusy = false;
                  this.deselectPlayer();
                }
                return;
              }

              if (!currentAction) {
                // If no action declared for this player, implicitly declare
                // BLOCK — refused e.g. for a prone/stunned blocker
                if (
                  !this.gameService.declareAction(selectedPlayer.id, "block")
                ) {
                  this.eventBus.emit(
                    GameEventNames.UI_Notification,
                    "This player cannot Block (down players must Blitz)."
                  );
                  return;
                }
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

        // If not a block, select them (inspection) — but never while a
        // targeted action is mid-declaration. Reaching here means the click
        // was not a valid target for that action; abandoning the action and
        // reselecting the clicked player is never what the coach meant.
        if (
          this.currentActionMode !== null &&
          !mayBlockFromHere &&
          this.currentActionMode !== "move"
        ) {
          console.warn(
            `[Interaction] Clicked player during ${this.currentActionMode} mode; ignoring to prevent selection change.`
          );
          this.eventBus.emit(
            GameEventNames.UI_Notification,
            `Finish your ${this.currentActionMode} Action first!`
          );
          return;
        }

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

    // 3. Visualization
    if (this.selectedPlayerId) {
      const isPassMode =
        (this.currentActionMode === "pass" && this.currentStepId === "pass") ||
        // A hand-off aims at an adjacent team-mate — same pass template/arrow.
        (this.currentActionMode === "handoff" &&
          this.currentStepId === "handoff") ||
        // A thrown Bomb aims like a Pass — same range template + arrow.
        (this.currentActionMode === "throwBomb" &&
          this.currentStepId === "bomb");

      if (isPassMode) {
        // PASS MODE: Visualize even if hovering a player
        this.pitch.clearPath(); // Ensure movement path is gone

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

          // Preview the interception corridor for a throw at this square: the
          // whole zone a defender could intercept from, plus the squares where
          // a standing opponent actually threatens the throw.
          const opponents = this.gameService.getOpponents(
            selectedPlayer.teamId
          );
          const zone = this.passController.getInterceptionSquares(
            selectedPlayer.gridPosition,
            { x, y }
          );
          const threats = this.passController
            .checkInterceptions(
              selectedPlayer.gridPosition,
              { x, y },
              opponents,
              true
            )
            .map((i) => i.position);
          this.pitch.drawInterceptZone(
            selectedPlayer.gridPosition,
            { x, y },
            zone,
            threats
          );
        }
      } else if (
        this.currentActionMode === "throwTeamMate" &&
        this.currentStepId === "throw"
      ) {
        // THROW TEAM-MATE aim: reuse the pass arrow + range template, but
        // capped to Quick and Short range (a thrown player is too heavy to go
        // further — Long / Long Bomb are out of range).
        this.pitch.clearPath();
        const thrower = this.gameService.getPlayerById(this.selectedPlayerId);
        if (thrower && thrower.gridPosition) {
          if (this.ttmTeammateId) {
            // A mate is chosen: show the throw template + arrow to the cursor.
            const all = this.passController.getAllRanges(thrower.gridPosition);
            const limited = new Map<string, { x: number; y: number }[]>();
            for (const type of ["Quick Pass", "Short Pass"]) {
              const squares = all.get(type as never);
              if (squares) limited.set(type, squares);
            }
            this.pitch.drawPassZones(thrower.gridPosition, limited);

            const inRange = isThrowTeammateInRange(thrower.gridPosition, {
              x,
              y,
            });
            const passRange = this.passController.measureRange(
              thrower.gridPosition,
              { x, y }
            );
            // In range → colour by Quick/Short; out of range → grey arrow.
            this.pitch.drawPassLine(
              thrower.gridPosition,
              { x, y },
              inRange ? passRange.type : "Out of Range"
            );
          } else {
            // No mate chosen yet: no target highlight, just clear stale viz.
            this.pitch.clearPassVisualization();
          }
        }
      } else if (
        this.currentActionMode === "foul" &&
        this.currentStepId === "foul"
      ) {
        // FOUL MODE: Highlight valid targets
        this.pitch.clearPath();
        const selectedPlayer = this.gameService.getPlayerById(
          this.selectedPlayerId
        );
        if (selectedPlayer && selectedPlayer.gridPosition) {
          const opponents = this.gameService.getOpponents(
            selectedPlayer.teamId
          );
          const adjOpponents = opponents.filter((p) => {
            if (!p.gridPosition) return false;
            const dx = Math.abs(
              p.gridPosition.x - selectedPlayer.gridPosition!.x
            );
            const dy = Math.abs(
              p.gridPosition.y - selectedPlayer.gridPosition!.y
            );
            return (
              dx <= 1 &&
              dy <= 1 &&
              (p.status === PlayerStatus.PRONE ||
                p.status === PlayerStatus.STUNNED)
            );
          });

          adjOpponents.forEach((p) => {
            if (p.gridPosition) {
              this.pitch.highlightSquare(
                p.gridPosition.x,
                p.gridPosition.y,
                0xff0000
              );
            }
          });
        }
      } else if (this.jumpTargeting) {
        // JUMP MODE: show every legal landing at once (lines + end nodes +
        // amber jump-over nodes); no free walking path.
        this.pitch.clearPassVisualization();
        const selectedPlayer = this.gameService.getPlayerById(
          this.selectedPlayerId
        );
        if (selectedPlayer?.gridPosition) {
          this.pitch.drawJumpTargets(
            selectedPlayer.gridPosition,
            this.computeJumpTargets(selectedPlayer)
          );
        } else {
          this.pitch.clearPath();
        }
      } else {
        // MOVE MODE: Only visualize if NOT hovering a player
        this.pitch.clearPassVisualization();

        if (!player) {
          this.drawPath(x, y);
        } else {
          this.pitch.clearPath();
        }
      }
    } else {
      this.pitch.clearPath();
      this.pitch.clearPassVisualization();
    }
  }

  public handlePlayerClick(playerId: string): void {
    // Online: input is locked while the opponent owns the turn/decision
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    console.log(
      `[Interaction] handlePlayerClick: ${playerId}. Mode: ${this.currentActionMode}, Step: ${this.currentStepId}, Selected: ${this.selectedPlayerId}`
    );

    // Chain push: the option squares are occupied, so the click arrives via
    // the player sprite — route it to the push decision. While the decision
    // is open no selection changes are allowed (it's mandatory).
    if (this.pushSelectionActive) {
      const clicked = this.gameService.getPlayerById(playerId);
      if (clicked && clicked.gridPosition) {
        this.handlePushDirectionClick(
          clicked.gridPosition.x,
          clicked.gridPosition.y
        );
      }
      return;
    }

    // A player click and a grid-square click must take the same route during
    // kickoff selection. Previously sprite-originated clicks fell through to
    // ordinary turn selection and never reached the kickoff event manager.
    if (this.gameService.getPhase() === GamePhase.KICKOFF) {
      const step = this.gameService.getKickoffEventStep();
      const clicked = this.gameService.getPlayerById(playerId);
      if (step && !step.charge?.activePlayerId && clicked?.gridPosition) {
        this.handleKickoffClick(
          clicked.gridPosition.x,
          clicked.gridPosition.y,
          clicked
        );
        return;
      }
      if (
        step?.charge?.activePlayerId &&
        step.charge.activePlayerId !== playerId
      ) {
        return;
      }
    }

    // CRITICAL FIX: while aiming a targeted throw at a team-mate — a Pass or a
    // Hand-off — clicking a player MUST be treated as a TARGET click that
    // completes the action, never a re-selection of the clicked team-mate.
    if (
      (this.currentActionMode === "pass" && this.currentStepId === "pass") ||
      (this.currentActionMode === "handoff" && this.currentStepId === "handoff")
    ) {
      const p1 = this.scene.team1.players.find((p) => p.id === playerId);
      const p2 = this.scene.team2.players.find((p) => p.id === playerId);
      const player = p1 || p2;

      if (player && player.gridPosition) {
        console.log(
          `[Interaction] Target player clicked at ${player.gridPosition.x},${player.gridPosition.y}. Triggering ${this.currentActionMode} onSquareClicked.`
        );
        this.onSquareClicked(player.gridPosition.x, player.gridPosition.y);
        return; // EXIT IMMEDIATELY - DO NOT SELECT PLAYER
      }
    }

    // A Foul claims player clicks at either step (see onSquareClicked) so the
    // victim can be picked without first advancing the stepper.
    if (this.currentActionMode === "foul") {
      const player = this.gameService.getPlayerById(playerId);
      if (player && player.gridPosition) {
        this.onSquareClicked(player.gridPosition.x, player.gridPosition.y);
        return;
      }
    }

    if (
      this.currentActionMode === "multipleBlock" &&
      this.currentStepId === "multipleBlock"
    ) {
      const player = this.gameService.getPlayerById(playerId);
      if (player?.gridPosition) {
        this.onSquareClicked(player.gridPosition.x, player.gridPosition.y);
        return;
      }
    }

    // Throw Bomb: clicking a player aims the bomb at their square.
    if (
      this.currentActionMode === "throwBomb" &&
      this.currentStepId === "bomb"
    ) {
      const player = this.gameService.getPlayerById(playerId);
      if (player && player.gridPosition) {
        this.onSquareClicked(player.gridPosition.x, player.gridPosition.y);
        return;
      }
    }

    // Throw / Kick Team-mate: route the click to the grid handler, which
    // selects a valid target team-mate (auto-advancing to the aim step) or
    // aims once a target is chosen — never a plain re-selection.
    if (this.currentActionMode === "throwTeamMate") {
      const clicked = this.gameService.getPlayerById(playerId);
      if (clicked && clicked.gridPosition) {
        this.onSquareClicked(clicked.gridPosition.x, clicked.gridPosition.y);
        return;
      }
    }

    // Direct Special Actions and replacement Blitzes claim player-sprite
    // clicks as target selections; never let them become a re-selection.
    if (
      this.currentStepId === "target" &&
      (this.currentBlockReplacement !== null ||
        this.currentActionMode === "gaze")
    ) {
      const clicked = this.gameService.getPlayerById(playerId);
      if (clicked?.gridPosition) {
        this.onSquareClicked(clicked.gridPosition.x, clicked.gridPosition.y);
        return;
      }
    }

    // Pass Mode Check 2: If we are in Pass Mode but maybe logic above failed,
    // we STILL should not select another player if we are mid-action.
    // However, if we click OURSELVES, that's fine (ignored below).
    // If we click Teammate? In pass mode, that's a pass to them.
    // So the block above should cover it.

    // NEW BLOCK: If we are already selected and clicked ourselves, do nothing (don't re-trigger select)
    if (this.selectedPlayerId === playerId) {
      console.log(
        "[Interaction] Clicked self, ignoring re-selection to preserve state."
      );
      return;
    }

    // Safety for other actions (Blitz/block etc) -> If busy or in middle of action step that aims
    if (this.currentActionMode && this.currentStepId !== "move") {
      // If we are in 'block' step, clicking player handles block in onSquareClicked usually,
      // but handlePlayerClick comes from visual layer.
      // We should redirect to onSquareClicked for consistency?
      // For now, only strict on Pass as requested.
    }

    // Default: Select the player (or toggle selection)
    console.log("[Interaction] Defaulting to selection change.");
    this.selectPlayer(playerId);
  }

  public selectPlayer(playerId: string): void {
    const player = this.gameService.getPlayerById(playerId);

    if (!player) return;

    // Switching away from a live declaration: release it if nothing has
    // committed (the team's allowance comes back, nobody is activated), or
    // refuse the switch — the declaring player stays selected — once it has.
    if (this.selectedPlayerId && this.selectedPlayerId !== playerId) {
      const prevId = this.selectedPlayerId;
      const state = this.gameService.getState();
      if (state.activePlayer?.id === prevId) {
        if (!this.gameService.cancelAction(prevId)) {
          this.eventBus.emit(
            GameEventNames.UI_Notification,
            "This action is already committed and cannot be released."
          );
          return;
        }
      } else {
        // No live declaration lingers for the previous player, but movement
        // spent outside a declaration must not leave their turn dangling.
        const prevUsed = this.gameService.getMovementUsed(prevId);
        const prevActed = this.gameService.hasPlayerActed(prevId);
        if (prevUsed > 0 && !prevActed) {
          this.gameService.finishActivation(prevId);
        }
      }
    }

    this.deselectPlayer();
    this.selectedPlayerId = playerId;

    // Visual highlight
    this.scene.highlightPlayer(playerId);

    // UI Selection Event
    this.eventBus.emit(GameEventNames.PlayerSelected, { player });

    this.refreshPlayerVisualization(playerId);
  }

  private refreshPlayerVisualization(playerId: string): void {
    const state = this.gameService.getState();
    const player = this.gameService.getPlayerById(playerId);
    if (!player) return;

    const chargePlayerId =
      this.gameService.getPhase() === GamePhase.KICKOFF
        ? this.gameService.getKickoffEventStep()?.charge?.activePlayerId
        : undefined;
    const canActivate =
      this.gameService.canActivate(playerId) || chargePlayerId === playerId;
    const isOwnTurn = state.activeTeamId === player.teamId;

    if (isOwnTurn && canActivate) {
      // Show Movement Range
      // Show range if NOT in Pass Mode OR if in Move Step of Pass Mode
      if (this.currentActionMode !== "pass" || this.currentStepId === "move") {
        // Calculate remaining SAFE MA (for overlay coloring)
        let used = this.gameService.getMovementUsed(playerId);

        // If prone, they need to spend 3 MA to stand (or all MA if less than 3)
        if (player.status === "Prone") {
          const standUpCost = Math.min(3, player.stats.MA);
          used += standUpCost;
        }

        // With waypoints planned, draw the range as if the player already
        // stood on the last node with the spent squares deducted
        let reachable: { x: number; y: number; cost?: number }[];
        if (this.waypoints.length > 0) {
          const lastNode = this.waypoints[this.waypoints.length - 1];
          const team =
            player.teamId === this.getSceneTeam1().id
              ? this.getSceneTeam1()
              : this.getSceneTeam2();
          const opponentTeam =
            player.teamId === this.getSceneTeam1().id
              ? this.getSceneTeam2()
              : this.getSceneTeam1();
          const remainingAllowance = Math.max(
            0,
            moveAllowance(player) - used - this.waypoints.length
          );
          reachable = this.movementValidator
            .findReachableSquares(
              { ...player, gridPosition: { ...lastNode } },
              opponentTeam.players.filter((p) => p.gridPosition),
              team.players.filter((p) => p.gridPosition && p.id !== player.id)
            )
            .filter((m) => m.cost <= remainingAllowance);
          used += this.waypoints.length;
        } else {
          reachable = this.gameService.getAvailableMovements(playerId);
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
      } else {
        // If in Pass Step (aiming), clear the movement overlays to reduce clutter
        this.pitch.clearLayer("range_overlay");
        this.pitch.clearLayer("sprint_risk");
      }

      // Show Tackle Zones (always show these)
      const opponents = this.getOpposingPlayers(player.teamId);
      const tackleZones: { x: number; y: number }[] = [];

      opponents.forEach((op) => {
        if (hasTackleZone(op) && op.gridPosition) {
          // Standing and not Distracted — Distracted opponents draw none
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
    // A push direction is a mandatory decision: Escape/background clicks
    // must not wipe the pending push highlights mid-block
    if (this.pushSelectionActive) return;

    if (this.selectedPlayerId) {
      this.scene.unhighlightPlayer(this.selectedPlayerId);
      this.selectedPlayerId = null;
    }
    this.waypoints = [];
    this.clearAllInteractionHighlights();
    // Also drop the pitch-layer visuals (range/sprint/tackle overlays, path)
    this.pitch.clearHighlights();
    this.pitch.clearPath();

    // Reset action mode state
    this.currentActionMode = null;
    this.currentBlockReplacement = null;
    this.currentStepId = null;
    this.jumpTargeting = false;
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
      const totalAllowance = moveAllowance(player);
      const remainingAllowance = Math.max(0, totalAllowance - used);

      const currentLen = this.waypoints.length;
      const newLen = currentLen + result.path.length;

      if (newLen <= remainingAllowance) {
        this.waypoints.push(...result.path);
        this.drawCurrentPath();
        // Range/sprint overlays now measure from the last node
        this.refreshPlayerVisualization(player.id);
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
        this.hasMovedInAction = true;
        this.eventBus.emit(GameEventNames.PlayerMovedInAction, { playerId });

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
            });
          }

          // REFRESH SELECTION logic to update the Range Overlay
          // calling selectPlayer would reset the action mode, so we use refresh
          this.refreshPlayerVisualization(playerId);
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
    this.eventBus.off(GameEventNames.UI_CancelAction, this.onCancelAction);
    this.eventBus.off(GameEventNames.UI_EndActivation, this.onEndActivation);
    this.eventBus.off(
      GameEventNames.UI_ResumeBlitzMove,
      this.resumeBlitzMoveHandler
    );
    this.eventBus.off(GameEventNames.PhaseChanged, this.onPhaseChangedReset);
    this.eventBus.off(
      GameEventNames.KickoffEventStepStarted,
      this.kickoffStepSyncHandler
    );
    this.eventBus.off(
      GameEventNames.KickoffEventStepResolved,
      this.kickoffStepSyncHandler
    );
    this.eventBus.off(GameEventNames.UI_SyncBoard, this.kickoffStepSyncHandler);
    this.eventBus.off(GameEventNames.PlayerMoved, this.kickoffStepSyncHandler);
    this.eventBus.off(GameEventNames.PlayerPlaced, this.kickoffStepSyncHandler);
    this.eventBus.off(GameEventNames.PlayerRemoved, this.kickoffStepSyncHandler);
    this.eventBus.off(
      GameEventNames.PlayerSelected,
      this.kickoffPlayerSelectedHandler
    );

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

  private handleKickoffClick(
    x: number,
    y: number,
    playerAtSquare: Player | null
  ): void {
    const eventStep = this.gameService.getKickoffEventStep();
    if (eventStep) {
      const mayAct = getActiveOnlineMatch()?.mayAct() ?? true;
      if (!mayAct) return;

      // Solid Defence is intentionally drag-only. A click or pointer-down is
      // part of beginning that drag and must never select/remove the player.
      if (eventStep.event === KickoffEvent.SOLID_DEFENCE) return;

      if (
        playerAtSquare &&
        playerAtSquare.teamId === eventStep.teamId &&
        !eventStep.charge
      ) {
        const wasSelected = eventStep.selectedPlayerIds.includes(
          playerAtSquare.id
        );
        if (this.gameService.selectKickoffEventPlayer(playerAtSquare.id)) {
          this.selectedPlayerId = wasSelected ? null : playerAtSquare.id;
          this.eventBus.emit(GameEventNames.PlayerSelected, {
            player: wasSelected ? null : playerAtSquare,
          });
          // High Kick has exactly one known destination. Selecting the Open
          // receiver on the pitch is the whole interaction.
          if (
            !wasSelected &&
            eventStep.event === KickoffEvent.HIGH_KICK &&
            eventStep.landingSquare
          ) {
            this.gameService.placeKickoffEventPlayer(
              playerAtSquare.id,
              eventStep.landingSquare.x,
              eventStep.landingSquare.y
            );
            this.selectedPlayerId = null;
          }
          this.syncKickoffStepInteraction();
        }
        return;
      }

      if (this.selectedPlayerId) {
        const applied =
          eventStep.event === KickoffEvent.QUICK_SNAP
            ? this.gameService.moveKickoffEventPlayer(
                this.selectedPlayerId,
                x,
                y
              )
            : this.gameService.placeKickoffEventPlayer(
                this.selectedPlayerId,
                x,
                y
              );
        if (applied) {
          this.selectedPlayerId = null;
          this.syncKickoffStepInteraction();
        } else {
          this.eventBus.emit(
            GameEventNames.UI_Notification,
            eventStep.event === KickoffEvent.QUICK_SNAP
              ? "Quick Snap: choose one adjacent empty pitch square."
              : "Solid Defence: choose a legal empty setup square."
          );
        }
      }
      return;
    }

    const subPhase = this.gameService.getSubPhase();

    if (subPhase === SubPhase.ROLL_KICKOFF) {
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
          // Kickoff selection is only for aiming the kick — clear any
          // movement/tackle overlays so it isn't mistaken for an activation.
          this.pitch.clearHighlights();
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
        this.isBusy = true;
        try {
          this.gameService.kickBall(
            isTeam1Kicking,
            this.selectedPlayerId,
            x,
            y
          );
          this.selectedPlayerId = null; // Clear selection after kick
        } finally {
          this.isBusy = false;
        }
      } else {
        this.eventBus.emit(
          GameEventNames.UI_Notification,
          "Select a Kicker first!"
        );
      }
    }
  }

  /**
   * Keep kickoff interaction visible on the board itself. Open eligible
   * players are blue; selected/current players are gold. Solid Defence also
   * enables setup-style dragging for eligible players without removing them
   * from the pitch.
   */
  private syncKickoffStepInteraction(): void {
    for (const playerId of this.kickoffHighlightedPlayerIds) {
      this.scene.unhighlightPlayer(playerId);
    }
    this.kickoffHighlightedPlayerIds.clear();
    this.scene.setKickoffSolidDefenceDragPlayers([]);

    const step = this.gameService.getKickoffEventStep();
    if (!step) return;

    const team = this.gameService.getTeam(step.teamId);
    if (!team) return;
    const onlineMatch = getActiveOnlineMatch();
    const canAct =
      !onlineMatch ||
      (onlineMatch.myTeamId === step.teamId && onlineMatch.mayAct());
    const opponents =
      team.id === this.scene.team1.id
        ? this.scene.team2.players
        : this.scene.team1.players;
    const eligible = team.players.filter((player) => {
      if (!player.gridPosition || player.status !== PlayerStatus.ACTIVE) {
        return false;
      }
      if (step.movedPlayerIds.includes(player.id)) return false;
      return !opponents.some(
        (opponent) =>
          opponent.status === PlayerStatus.ACTIVE &&
          opponent.gridPosition &&
          Math.max(
            Math.abs(opponent.gridPosition.x - player.gridPosition!.x),
            Math.abs(opponent.gridPosition.y - player.gridPosition!.y)
          ) === 1
        );
    });

    if (step.event === KickoffEvent.SOLID_DEFENCE && canAct) {
      this.scene.setKickoffSolidDefenceDragPlayers(
        eligible.map((player) => player.id)
      );
    }

    for (const player of eligible) {
      this.scene.highlightPlayer(player.id, 0x38bdf8);
      this.kickoffHighlightedPlayerIds.add(player.id);
    }
    for (const playerId of step.selectedPlayerIds) {
      this.scene.highlightPlayer(playerId, 0xffd700);
      this.kickoffHighlightedPlayerIds.add(playerId);
    }
    if (step.charge?.activePlayerId) {
      this.selectedPlayerId = step.charge.activePlayerId;
      this.scene.highlightPlayer(step.charge.activePlayerId, 0xffd700);
      this.kickoffHighlightedPlayerIds.add(step.charge.activePlayerId);
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

  /** Every legal Jump (over → landing) for the selected player right now. */
  private computeJumpTargets(player: Player): JumpTarget[] {
    const from = player.gridPosition;
    if (!from || player.status !== PlayerStatus.ACTIVE) return [];
    const others = [
      ...this.getSceneTeam1().players,
      ...this.getSceneTeam2().players,
    ].filter((p) => p.id !== player.id && p.gridPosition);
    const canJumpAnything =
      hasSkill(player.skills, SkillType.LEAP) ||
      hasSkill(player.skills, SkillType.POGO);
    const inBounds = (x: number, y: number) =>
      x >= 0 &&
      y >= 0 &&
      x < GameConfig.PITCH_WIDTH &&
      y < GameConfig.PITCH_HEIGHT;
    return jumpTargets(from, others, canJumpAnything, inBounds);
  }

  /** True when `target` is a legal Jump landing square (a push-back square). */
  private isJumpTarget(
    player: Player,
    target: { x: number; y: number }
  ): boolean {
    return this.computeJumpTargets(player).some(
      (t) => t.dest.x === target.x && t.dest.y === target.y
    );
  }

  /**
   * Resolve a Jump-targeting click: leap over the adjacent player into the
   * clicked push-back square. A Jump does not end the Move — if the player is
   * still Standing with an activation left they stay selected and can move or
   * Jump again (the Move step is never marked complete).
   */
  private async handleJumpClick(x: number, y: number): Promise<void> {
    const player = this.gameService.getPlayerById(this.selectedPlayerId!);
    if (!player?.gridPosition) return;
    if (!this.isJumpTarget(player, { x, y })) {
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        "Click one of the highlighted landing squares to Jump."
      );
      return;
    }
    this.jumpTargeting = false;
    this.pitch.clearPath();
    try {
      await this.gameService.jumpPlayer(player.id, { x, y });
    } catch (err) {
      this.eventBus.emit(GameEventNames.UI_Notification, `Cannot Jump: ${err}`);
    }
    const after = this.gameService.getPlayerById(player.id);
    if (
      after?.status === PlayerStatus.ACTIVE &&
      this.gameService.canActivate(player.id)
    ) {
      // Keep the player selected and in Move mode so they can keep moving or
      // Jump again; refresh the movement overlay for the new square.
      this.refreshPlayerVisualization(player.id);
    } else {
      this.deselectPlayer();
    }
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
  private startPushDirectionSelection(data: {
    validDirections: { x: number; y: number }[];
    defenderId: string;
    attackerId?: string;
    resultType?: string;
    pushTier?: "open" | "chain" | "crowd";
  }): void {
    this.pushSelectionActive = true;
    this.pushValidDirections = data.validDirections || [];
    this.pushDefenderId = data.defenderId;
    this.pushAttackerId = data.attackerId || ""; // Store attacker ID
    this.pushResultType = data.resultType || "";

    // Clear any existing highlights first
    this.clearAllInteractionHighlights();

    // Yellow = open square, orange = chain push, red = into the crowd
    const tierColors = { open: 0xffff00, chain: 0xff8800, crowd: 0xff0000 };
    const color = tierColors[data.pushTier ?? "open"];
    if (data.pushTier === "crowd") {
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        "Push into the crowd!"
      );
    } else if (data.pushTier === "chain") {
      this.eventBus.emit(GameEventNames.UI_Notification, "Chain push!");
    }

    // Highlight the valid push squares using HighlightManager
    this.pushValidDirections.forEach((dir) => {
      this.highlightManager.addPushHighlight(dir.x, dir.y, color);
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
      const attackerId = this.pushAttackerId;
      const defenderId = this.pushDefenderId;
      const resultType = this.pushResultType;

      // Reset BEFORE executing: a chain push emits the next push-direction
      // decision synchronously from inside executePush, and that fresh
      // selection state must not be clobbered afterwards
      this.pushSelectionActive = false;
      this.pushValidDirections = [];
      this.pushDefenderId = "";
      this.pushAttackerId = "";
      this.pushResultType = "";
      this.clearAllInteractionHighlights();

      this.gameService.executePush(
        attackerId,
        defenderId,
        { x, y },
        resultType,
        false
      );

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

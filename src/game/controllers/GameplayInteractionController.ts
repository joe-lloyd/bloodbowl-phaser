import Phaser from "phaser";
import { GameScene } from "../../scenes/GameScene";
import { IGameService } from "../../services/interfaces/IGameService";
import { Pitch, SquareMarker } from "../elements/Pitch";
import { MovementValidator } from "../validators/MovementValidator";
import { GameConfig } from "../../config/GameConfig";
import { GamePhase } from "../../types/GameState";
import { IEventBus } from "../../services/EventBus";
import { Player } from "@/types/Player";
import { ActionType, GameEventNames, UIEvents } from "@/types/events";
import { HighlightManager } from "../managers/HighlightManager";
import { DiceWatch } from "../presentation/diceWatch";
import { PassController } from "./PassController";
import { getActiveOnlineMatch } from "../../network/OnlineMatch";
import { BlockReplacement } from "../../types/BlockReplacement";
import type { DecisionRequest, WizardSpell } from "../../types/decisions";
import { TargetRollPreview } from "../rules/rollPreview";
import { ActionStep } from "./interaction/actionSteps";
import { BiteAndSpellTargets } from "./interaction/BiteAndSpellTargets";
import { Confirmations } from "./interaction/Confirmations";
import { PushPicker } from "./interaction/PushPicker";
import {
  askGates,
  cancelAction,
  endActivation,
  reconcileRejectedCommand,
  resumeBallAndChain,
  resumeActivePlayer,
  resumeBlitzMove,
  selectAction,
  selectPlayer,
  selectStep,
} from "./interaction/actionModes";
import {
  followChargeSelection,
  handleKickoffClick,
  kickoffPlayerClick,
  syncKickoffStep,
} from "./interaction/kickoffInteraction";
import { previewSquare } from "./interaction/previews";
import { aimThrow, clearMovePlan, goMovePlan } from "./interaction/planBar";
import { dragRouteTo, routeOwnerAt } from "./interaction/routes";
import { playerClickTarget } from "./interaction/stepClicks";
import {
  clickInPlay,
  clickTouchback,
  handleJumpClick,
} from "./interaction/squareClicks";

type Square = { x: number; y: number };

/**
 * The pointer and click controller for the match: selection, routes,
 * action modes, previews, the kick-off, and push and bite picking.
 *
 * The board's state lives here. The modules under ./interaction take this
 * controller and read and change that state as the methods here did, so
 * the fields they use are public.
 */
export class GameplayInteractionController {
  readonly scene: GameScene;
  readonly gameService: IGameService;
  readonly eventBus: IEventBus;
  readonly pitch: Pitch;
  readonly movementValidator: MovementValidator;
  private highlightManager: HighlightManager;

  // State
  selectedPlayerId: string | null = null;
  lastHoverGrid: Square | null = null;
  waypoints: Square[] = [];
  /** Where a finger aimed a throw, and at which step (see aimKey). */
  aimedAt: { key: string; x: number; y: number } | null = null;
  targetRollPreview: TargetRollPreview | null = null;
  targetAnchor: Square | null = null;
  publishTargetPreview = () => {
    const preview = this.targetRollPreview;
    if (!preview) return;
    const world = this.pitch.getPixelPosition(
      preview.square.x,
      preview.square.y
    );
    const camera = this.scene.cameras.main;
    const anchor = {
      x:
        ((world.x - camera.worldView.x) * camera.zoom) / this.scene.scale.width,
      y:
        ((world.y - camera.worldView.y) * camera.zoom) /
        this.scene.scale.height,
    };
    if (this.targetAnchor?.x === anchor.x && this.targetAnchor.y === anchor.y)
      return;
    this.targetAnchor = anchor;
    this.eventBus.emit(GameEventNames.UI_TargetRollPreview, {
      ...preview,
      anchor,
    });
  };
  /** A Dodge/Rush prompt waits for the dice before it opens. */
  readonly dice: DiceWatch;
  /** The yes-or-no questions still open, dropped on destroy. */
  readonly confirmations: Confirmations;
  /** A failed Bloodlust's bite, and a Sports-Wizard spell's target. */
  readonly targets: BiteAndSpellTargets;
  /** The square a Block pushes to: a mandatory pick. */
  readonly push: PushPicker;

  // Store handler references for cleanup
  private pushDirectionHandler: (
    data: UIEvents[GameEventNames.UI_SelectPushDirection]
  ) => void;
  private resumeBlitzMoveHandler: (data: { playerId: string }) => void;
  kickoffHighlightedPlayerIds = new Set<string>();
  /** The squares a kick-off one-square mover may step to, drawn for them. */
  kickoffSquareMarkers: SquareMarker[] = [];
  private kickoffStepSyncHandler = () => this.syncKickoffStepInteraction();
  private kickoffPlayerSelectedHandler = (data: { player: Player | null }) =>
    followChargeSelection(this, data.player);

  // Pass mode state
  currentActionMode: ActionType | null = null;
  /** Explicit direct/Blitz attack declaration retained through movement. */
  currentBlockReplacement: BlockReplacement | null = null;
  currentStepId: string | null = null;
  actionSteps: ActionStep[] = [];
  hasMovedInAction: boolean = false;
  /**
   * The Jump step is selected: a click Jumps two squares in the compass
   * direction toward the pointer. A separate flag (not currentStepId) so the
   * Move step is never marked "done" — a Jump does not consume the Move.
   */
  jumpTargeting: boolean = false;
  /** The team-mate chosen for a Throw / Kick Team-mate Action, awaiting an aim. */
  ttmTeammateId: string | null = null;
  /** First opponent selected for a Multiple Block, awaiting the second. */
  multipleBlockFirstTargetId: string | null = null;
  readonly passController: PassController;

  /**
   * Online guest only. Bumped by every local mutation of
   * currentActionMode/selectedPlayerId (selectPlayer, deselectPlayer, a
   * successful onActionSelected). Used to detect whether the coach has
   * moved on locally since an optimistic cancel-action was sent, so a
   * rejection that arrives late for THAT cancel doesn't clobber whatever
   * newer state the coach has since built — see onNetworkCommandRejected.
   */
  interactionSeq = 0;
  /** playerId -> interactionSeq at the moment a cancel-action's optimistic
   *  local reset was applied. A rejection for that cancel only reconciles
   *  if interactionSeq is still exactly this value — i.e. nothing local
   *  happened for this player in between. */
  pendingCancelSeqByPlayer = new Map<string, number>();

  // Interaction Lock
  isBusy: boolean = false;

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
    this.dice = new DiceWatch(eventBus);
    this.confirmations = new Confirmations(eventBus);
    this.targets = new BiteAndSpellTargets(gameService, scene, pitch, (x, y) =>
      this.getPlayerAt(x, y)
    );
    this.push = new PushPicker(gameService, eventBus, this.highlightManager);
    this.passController = gameService.getPassController();
    this.scene.events.on("postupdate", this.publishTargetPreview);

    // Store handler reference for cleanup
    this.pushDirectionHandler = (data) => {
      this.push.start(data);
    };

    // A Blitz block that left movement re-enters the move
    this.resumeBlitzMoveHandler = (data) => {
      resumeBlitzMove(this, data.playerId);
    };

    // Listen for push direction selection request
    this.eventBus.on(
      GameEventNames.UI_SelectPushDirection,
      this.pushDirectionHandler
    );
    this.eventBus.on(
      GameEventNames.UI_ResumeBallAndChain,
      this.resumeBallAndChain
    );
    this.eventBus.on(GameEventNames.DecisionResolved, this.onDecisionResolved);
    this.eventBus.on(
      GameEventNames.DecisionRequested,
      this.onDecisionRequested
    );

    // Listen for player actions (Blitz, Stand Up)
    this.eventBus.on(GameEventNames.UI_ActionSelected, this.onActionSelected);
    this.eventBus.on(GameEventNames.UI_StepSelected, this.onStepSelected);
    this.eventBus.on(GameEventNames.UI_CancelAction, this.onCancelAction);
    this.eventBus.on(GameEventNames.UI_EndActivation, this.onEndActivation);
    this.eventBus.on(
      GameEventNames.RazzleDazzleSecondAction,
      this.onRazzleDazzleSecondAction
    );
    this.eventBus.on(GameEventNames.UI_WizardTargeting, this.onWizardTargeting);
    this.eventBus.on(GameEventNames.UI_GoMovePlan, this.onGoMovePlan);
    this.eventBus.on(GameEventNames.UI_ClearMovePlan, this.onClearMovePlan);
    this.eventBus.on(
      GameEventNames.NetworkCommandRejected,
      this.onNetworkCommandRejected
    );
    this.eventBus.on(
      GameEventNames.UI_ResumeBlitzMove,
      this.resumeBlitzMoveHandler
    );
    this.eventBus.on(GameEventNames.GameStateRestored, this.resumeActivePlayer);
    this.eventBus.on(GameEventNames.GameStateRestored, this.onStateRestored);
    this.eventBus.on(
      GameEventNames.KickoffEventStepStarted,
      this.kickoffStepSyncHandler
    );
    this.eventBus.on(
      GameEventNames.KickoffEventStepResolved,
      this.kickoffStepSyncHandler
    );
    this.eventBus.on(
      GameEventNames.KickoffEventStepChanged,
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

  /**
   * A bite with a choice of Thrall Linemen: mark each on the pitch for the
   * biting coach to click. Online, only the biting coach's board marks them.
   */
  private onDecisionRequested = (request: DecisionRequest) => {
    if (request.type === "bite-target") this.targets.markBiteTargets(request);
  };

  /**
   * A resync replaces the state without resolving the decision it held:
   * mark the bite the restored game waits on, if it waits on one.
   */
  private onStateRestored = () => {
    this.targets.clearBiteTargets();
    this.targets.markPendingBite();
  };

  /** The dialog picked a spell, or went back: aim it with the pitch. */
  private onWizardTargeting = ({ spell }: { spell: WizardSpell | null }) => {
    this.targets.aimSpell(spell);
  };

  /** Online, the other coach may pick the push; free this board then. */
  private onDecisionResolved = ({ type }: { type: string }) => {
    if (type === "bite-target") this.targets.clearBiteTargets();
    if (type === "inducement-choice") this.targets.dropSpell();
    if (type !== "push-direction" || !this.push.active) return;
    this.push.reset();
    this.clearAllInteractionHighlights();
  };

  private onPhaseChangedReset = (data: { phase: GamePhase }) => {
    if (data.phase === GamePhase.PLAY) {
      return;
    }
    this.push.reset();
    this.targets.clearBiteTargets();
    this.isBusy = false;
    this.deselectPlayer();
    this.pitch.clearHover();
  };

  private onEndActivation = () => endActivation(this);

  /**
   * Razzle-Dazzle: the first Action ended and the activation stays open.
   * Whatever ended it deselects the player first, so the board picks them
   * up again a moment later with the menu for the second Action.
   */
  private onRazzleDazzleSecondAction = ({ playerId }: { playerId: string }) => {
    setTimeout(() => {
      const active = this.gameService.getState().activePlayer;
      if (active?.id === playerId && active.razzleDazzle?.awaitingSecond) {
        this.selectPlayer(playerId);
      }
    }, 50);
  };

  private onCancelAction = () => cancelAction(this);

  /** Online guest only: undo a declaration or cancel the host refused. */
  private onNetworkCommandRejected = (
    data: Parameters<typeof reconcileRejectedCommand>[1]
  ) => reconcileRejectedCommand(this, data);

  private onStepSelected = (data: { stepId: string }) => selectStep(this, data);

  private onActionSelected = (data: Parameters<typeof selectAction>[1]) =>
    selectAction(this, data);

  private resumeBallAndChain = (data: { playerId: string }) => {
    resumeBallAndChain(this, data.playerId);
  };

  /** A reload or resync may hand back this coach's player mid-action. */
  private resumeActivePlayer = () => resumeActivePlayer(this);

  public handlePointerDown(
    pointer: { worldX: number; worldY: number },
    isSetupActive: boolean
  ): void {
    if (isSetupActive) return;
    // Online: input is locked while the opponent owns the turn/decision
    if (getActiveOnlineMatch()?.mayAct() === false) return;

    // Crowd push squares sit one square off-pitch; accept clicks there
    // while a push direction is being chosen
    const margin = this.push.active ? 1 : 0;
    const { valid, gridX, gridY } = this.getGridFromPointer(pointer, margin);
    if (valid) {
      this.onSquareClicked(gridX, gridY);
    } else if (!this.push.active) {
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
      this.clearRollPreviews();
      this.pitch.clearHover();
      this.pitch.clearPath();
      this.eventBus.emit(GameEventNames.UI_HidePlayerInfo);
    }
  }

  private getGridFromPointer(
    pointer: { worldX: number; worldY: number },
    marginSquares: number = 0
  ): {
    valid: boolean;
    gridX: number;
    gridY: number;
  } {
    // World coordinates: the camera pans and zooms, so screen x/y won't do.
    const grid = this.pitch.worldToGrid(pointer.worldX, pointer.worldY);
    const m = marginSquares;
    if (
      grid.x >= -m &&
      grid.x <= GameConfig.PITCH_WIDTH - 1 + m &&
      grid.y >= -m &&
      grid.y <= GameConfig.PITCH_HEIGHT - 1 + m
    ) {
      return { valid: true, gridX: grid.x, gridY: grid.y };
    }
    return { valid: false, gridX: -1, gridY: -1 };
  }

  /**
   * A click on a pitch square. The bite and spell picks come first, then
   * the busy lock, the push pick, a Jump, the kick-off and the Touchback.
   * Anything left is a click in play: the declared step's, or the pitch's.
   */
  async onSquareClicked(x: number, y: number): Promise<void> {
    // Before the busy lock: the bite may be asked while a move that ends in
    // the End Zone is still being walked
    if (this.targets.handleBiteTargetClick(this.getPlayerAt(x, y)?.id)) return;
    if (this.targets.handleSpellClick(x, y)) return;
    if (this.isBusy) return;

    // Check if we're selecting a push direction first
    if (this.push.click(x, y)) {
      return; // Push direction was selected, done
    }
    if (this.push.active) {
      return; // Push direction is a mandatory decision: ignore other clicks
    }

    const phase = this.gameService.getPhase();
    const playerAtSquare = this.getPlayerAt(x, y);

    // JUMP TARGETING: while the Jump step is selected, any click Jumps two
    // squares in the compass direction toward the pointer — regardless of what
    // is under the cursor.
    if (this.jumpTargeting && this.selectedPlayerId) {
      await handleJumpClick(this, this.selectedPlayerId, x, y);
      return;
    }

    // KICKOFF PHASE
    if (
      phase === GamePhase.KICKOFF &&
      !this.gameService.getKickoffEventStep()?.charge?.activePlayerId
    ) {
      handleKickoffClick(this, x, y, playerAtSquare);
      return;
    }

    if (this.gameService.isTouchbackPending()) {
      clickTouchback(this, playerAtSquare);
      return;
    }

    return clickInPlay(this, { x, y, player: playerAtSquare });
  }

  onSquareHovered(x: number, y: number): void {
    this.targets.previewFireball(x, y);
    // Player Info
    const player = this.getPlayerAt(x, y);
    if (player) {
      this.eventBus.emit(GameEventNames.UI_ShowPlayerInfo, player);
    } else {
      this.eventBus.emit(GameEventNames.UI_HidePlayerInfo);
    }
    previewSquare(this, x, y);
  }

  public handlePlayerClick(playerId: string): void {
    // Online: input is locked while the opponent owns the turn/decision
    if (getActiveOnlineMatch()?.mayAct() === false) return;
    // A bite being chosen takes the click, even mid-walk
    if (this.targets.handleBiteTargetClick(playerId)) return;
    const square = this.gameService.getPlayerById(playerId)?.gridPosition;
    if (square && this.targets.handleSpellClick(square.x, square.y)) return;
    // A route is still being walked
    if (this.isBusy) return;
    console.log(
      `[Interaction] handlePlayerClick: ${playerId}. Mode: ${this.currentActionMode}, Step: ${this.currentStepId}, Selected: ${this.selectedPlayerId}`
    );

    // Chain push: the option squares are occupied, so the click arrives via
    // the player sprite — route it to the push decision. While the decision
    // is open no selection changes are allowed (it's mandatory).
    if (this.push.active) {
      const clicked = this.gameService.getPlayerById(playerId);
      if (clicked && clicked.gridPosition) {
        this.push.click(clicked.gridPosition.x, clicked.gridPosition.y);
      }
      return;
    }

    // A player click and a grid-square click must take the same route during
    // kickoff selection. Previously sprite-originated clicks fell through to
    // ordinary turn selection and never reached the kickoff event manager.
    if (kickoffPlayerClick(this, playerId)) return;

    const target = playerClickTarget(this, playerId);
    if (target) {
      this.onSquareClicked(target.x, target.y);
      return; // EXIT IMMEDIATELY - DO NOT SELECT PLAYER
    }

    // If we are already selected and clicked ourselves, do nothing (don't re-trigger select)
    if (this.selectedPlayerId === playerId) {
      console.log(
        "[Interaction] Clicked self, ignoring re-selection to preserve state."
      );
      return;
    }

    // Default: Select the player (or toggle selection)
    console.log("[Interaction] Defaulting to selection change.");
    this.selectPlayer(playerId);
  }

  public selectPlayer(playerId: string): void {
    selectPlayer(this, playerId);
  }

  public deselectPlayer(): void {
    // A push direction is a mandatory decision: Escape/background clicks
    // must not wipe the pending push highlights mid-block
    if (this.push.active) return;

    if (this.selectedPlayerId) {
      this.scene.unhighlightPlayer(this.selectedPlayerId);
      this.selectedPlayerId = null;
    }
    this.clearWaypoints();
    this.clearRollPreviews();
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
    // Local state moved on — invalidates any cancel-action rejection still
    // in flight for whichever player was selected before this.
    this.interactionSeq++;

    // Notify UI
    this.eventBus.emit(GameEventNames.PlayerSelected, { player: null }); // OR add explicit deselect event
  }

  /** A square click plots a move: declare one if the player has no action. */
  declareMoveIfNone(playerId: string, action?: string | null): boolean {
    const active = this.gameService.getState().activePlayer;
    if (active?.id === playerId && active.razzleDazzle?.awaitingSecond) {
      return this.gameService.declareAction(playerId, "move");
    }
    if (!action) {
      this.gameService.declareAction(playerId, "move");
      return true;
    }
    if (action === "block") {
      this.eventBus.emit(
        GameEventNames.UI_Notification,
        "Cannot Move during Block action"
      );
      return false;
    }
    return true;
  }

  clearWaypoints(): void {
    this.waypoints = [];
    this.eventBus.emit(GameEventNames.UI_MovePlan, null);
  }

  /**
   * A finger pressed here and started to drag: draw a route from the player
   * standing here, or on from the end of the plotted route. Selects the
   * player first when needed. False when no route starts here, and the drag
   * pans the camera instead.
   */
  public startRouteDrag(world: { worldX: number; worldY: number }): boolean {
    const { valid, gridX, gridY } = this.getGridFromPointer(world);
    if (!valid) return false;
    const owner = routeOwnerAt(this, gridX, gridY);
    if (!owner) return false;
    if (owner.id !== this.selectedPlayerId) this.selectPlayer(owner.id);
    if (this.selectedPlayerId !== owner.id) return false;
    // A negatrait roll comes first: ask, declare the Move, then drag again
    const asked = askGates(this, owner.id, "move");
    if (asked) {
      void asked.then((ok) => ok && this.declareMoveIfNone(owner.id));
      return false;
    }
    return true;
  }

  /**
   * The dragging finger reached a square. Back over the route cuts it to
   * there; anywhere else adds the square, by the shortest legal way from
   * the route's end, as a click on it would.
   */
  public dragRouteTo(world: { worldX: number; worldY: number }): void {
    const id = this.selectedPlayerId;
    const player = id ? this.gameService.getPlayerById(id) : undefined;
    const start = player?.gridPosition;
    if (!player || !start) return;
    const { valid, gridX, gridY } = this.getGridFromPointer(world);
    if (!valid) return;
    dragRouteTo(this, player, start, gridX, gridY);
  }

  /**
   * A finger tapped here. With no hover to read a throw's rolls from, a
   * throw aims first: the first tap on a square previews it as a mouse
   * over it does, and the plan bar shows the rolls; a second tap there, or
   * Go, throws. Every other tap is a click.
   */
  public tap(
    world: { worldX: number; worldY: number },
    isSetupActive: boolean
  ): void {
    const { valid, gridX, gridY } = this.getGridFromPointer(world);
    if (valid && !isSetupActive && aimThrow(this, gridX, gridY)) return;
    this.dropAim();
    this.handlePointerDown(world, isSetupActive);
  }

  dropAim(): void {
    if (!this.aimedAt) return;
    this.aimedAt = null;
    this.eventBus.emit(GameEventNames.UI_ThrowAim, null);
    // Online, the other coach stops seeing the throw's rolls too
    this.eventBus.emit(GameEventNames.UI_PassAimed, null);
  }

  /** Throw at the aimed square, or walk the plotted route. */
  private onGoMovePlan = (): void => goMovePlan(this);

  /** Drop the plotted route or the aim; the player stays selected. */
  private onClearMovePlan = (): void => clearMovePlan(this);

  public destroy(): void {
    // A question still open is dropped, never answered: whatever waited on
    // it (a Move, a Dodge, a declaration) must not carry on without a board
    this.confirmations.dropAll();
    this.scene.events.off("postupdate", this.publishTargetPreview);
    this.clearRollPreviews();
    this.dice.dispose();
    // Cleanup listeners
    this.eventBus.off(
      GameEventNames.UI_SelectPushDirection,
      this.pushDirectionHandler
    );
    this.eventBus.off(GameEventNames.UI_ActionSelected, this.onActionSelected);
    this.eventBus.off(GameEventNames.UI_StepSelected, this.onStepSelected);
    this.eventBus.off(GameEventNames.UI_CancelAction, this.onCancelAction);
    this.eventBus.off(GameEventNames.UI_EndActivation, this.onEndActivation);
    this.eventBus.off(
      GameEventNames.RazzleDazzleSecondAction,
      this.onRazzleDazzleSecondAction
    );
    this.eventBus.off(
      GameEventNames.UI_WizardTargeting,
      this.onWizardTargeting
    );
    this.eventBus.off(GameEventNames.UI_GoMovePlan, this.onGoMovePlan);
    this.eventBus.off(GameEventNames.UI_ClearMovePlan, this.onClearMovePlan);
    this.eventBus.off(
      GameEventNames.NetworkCommandRejected,
      this.onNetworkCommandRejected
    );
    this.eventBus.off(
      GameEventNames.UI_ResumeBlitzMove,
      this.resumeBlitzMoveHandler
    );
    this.eventBus.off(
      GameEventNames.UI_ResumeBallAndChain,
      this.resumeBallAndChain
    );
    this.eventBus.off(
      GameEventNames.GameStateRestored,
      this.resumeActivePlayer
    );
    this.eventBus.off(GameEventNames.PhaseChanged, this.onPhaseChangedReset);
    this.eventBus.off(GameEventNames.DecisionResolved, this.onDecisionResolved);
    this.eventBus.off(
      GameEventNames.DecisionRequested,
      this.onDecisionRequested
    );
    this.eventBus.off(GameEventNames.GameStateRestored, this.onStateRestored);
    this.targets.clearBiteTargets();
    this.eventBus.off(
      GameEventNames.KickoffEventStepStarted,
      this.kickoffStepSyncHandler
    );
    this.eventBus.off(
      GameEventNames.KickoffEventStepResolved,
      this.kickoffStepSyncHandler
    );
    this.eventBus.off(
      GameEventNames.KickoffEventStepChanged,
      this.kickoffStepSyncHandler
    );
    this.eventBus.off(GameEventNames.UI_SyncBoard, this.kickoffStepSyncHandler);
    this.eventBus.off(GameEventNames.PlayerMoved, this.kickoffStepSyncHandler);
    this.eventBus.off(GameEventNames.PlayerPlaced, this.kickoffStepSyncHandler);
    this.eventBus.off(
      GameEventNames.PlayerRemoved,
      this.kickoffStepSyncHandler
    );
    this.eventBus.off(
      GameEventNames.PlayerSelected,
      this.kickoffPlayerSelectedHandler
    );

    // Cleanup highlight manager
    if (this.highlightManager) {
      this.highlightManager.destroy();
    }
  }

  clearRollPreviews(): void {
    this.dropAim();
    this.targetRollPreview = null;
    this.targetAnchor = null;
    this.eventBus.emit(GameEventNames.UI_TargetRollPreview, null);
    this.eventBus.emit(GameEventNames.UI_RoutePreview, null);
    this.eventBus.emit(GameEventNames.UI_PassAimed, null);
    this.pitch.clearLayer("assist_ring");
  }

  /**
   * Keep kickoff interaction visible on the board itself. Open eligible
   * players are blue; selected/current players are gold.
   */
  syncKickoffStepInteraction(): void {
    syncKickoffStep(this);
  }

  /** Whoever stands on the square at this world point. */
  public playerAtPoint(world: {
    worldX: number;
    worldY: number;
  }): Player | null {
    const { valid, gridX, gridY } = this.getGridFromPointer(world);
    return valid ? this.getPlayerAt(gridX, gridY) : null;
  }

  public hasSelection(): boolean {
    return this.selectedPlayerId !== null;
  }

  getPlayerAt(x: number, y: number): Player | null {
    const t1 = this.getSceneTeam1();
    const t2 = this.getSceneTeam2();
    const players = [...t1.players, ...t2.players];

    return (
      players.find((p) => p.gridPosition?.x === x && p.gridPosition?.y === y) ||
      null
    );
  }

  // Helpers to access Scene data (temporary until full decouple)
  getSceneTeam1() {
    return this.scene.team1;
  }
  getSceneTeam2() {
    return this.scene.team2;
  }

  getOpposingPlayers(myTeamId: string): Player[] {
    const t1 = this.getSceneTeam1();
    const t2 = this.getSceneTeam2();
    return myTeamId === t1.id ? t2.players : t1.players;
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

import { scopeEventBus } from "../../services/scopedEventBus";
import type { InteractionScene, InteractionPitch, InteractionMovement, InteractionMarker } from "./interaction/ports";
import type Phaser from "phaser";
import { type IGameService } from "../../services/interfaces/IGameService";
import { GameConfig } from "../../config/GameConfig";
import { GamePhase } from "../../types/GameState";
import { isWallSquare } from "../rules/pitchSquares";
import { type IEventBus } from "../../services/EventBus";
import { type Player } from "@/types/Player";
import { type ActionType, GameEventNames, type UIEvents } from "@/types/events";
import { HighlightManager } from "../managers/HighlightManager";
import { DiceWatch } from "../presentation/diceWatch";
import type { PassController } from "./PassController";
import { getActiveOnlineMatch } from "../../network/OnlineMatch";
import { type BlockReplacement } from "../../types/BlockReplacement";
import type { DecisionRequest, WizardSpell } from "../../types/decisions";
import { type TargetRollPreview } from "../rules/rollPreview";
import { type ActionStep } from "./interaction/actionSteps";
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

interface Square {
  x: number;
  y: number;
}

export class GameplayInteractionController {
  readonly scene: InteractionScene;
  readonly gameService: IGameService;
  readonly eventBus: IEventBus;
  readonly pitch: InteractionPitch;
  readonly movementValidator: InteractionMovement;
  private highlightManager: HighlightManager;
  private readonly disposeHandlers: () => void;

  selectedPlayerId: string | null = null;
  lastHoverGrid: Square | null = null;
  waypoints: Square[] = [];

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

  readonly dice: DiceWatch;

  readonly confirmations: Confirmations;

  readonly targets: BiteAndSpellTargets;

  readonly push: PushPicker;

  private pushDirectionHandler: (
    data: UIEvents[typeof GameEventNames.UI_SelectPushDirection]
  ) => void;
  private resumeBlitzMoveHandler: (data: { playerId: string }) => void;
  kickoffHighlightedPlayerIds = new Set<string>();

  kickoffSquareMarkers: InteractionMarker[] = [];
  private kickoffStepSyncHandler = () => {
    this.syncKickoffStepInteraction();
  };
  private kickoffPlayerSelectedHandler = (data: { player: Player | null }) => {
    followChargeSelection(this, data.player);
  };

  currentActionMode: ActionType | null = null;

  currentBlockReplacement: BlockReplacement | null = null;
  currentStepId: string | null = null;
  actionSteps: ActionStep[] = [];
  hasMovedInAction = false;

  jumpTargeting = false;

  ttmTeammateId: string | null = null;

  multipleBlockFirstTargetId: string | null = null;
  readonly passController: PassController;

  interactionSeq = 0;

  pendingCancelSeqByPlayer = new Map<string, number>();

  isBusy = false;

  constructor(
{ scene,gameService,eventBus,pitch,movementValidator }: { scene: InteractionScene; gameService: IGameService; eventBus: IEventBus; pitch: InteractionPitch; movementValidator: InteractionMovement; }  ) {
    this.scene = scene;
    this.gameService = gameService;
    const subscriptions = scopeEventBus(eventBus);
    this.eventBus = subscriptions;
    this.disposeHandlers = () => { subscriptions.dispose(); };
    this.pitch = pitch;
    this.movementValidator = movementValidator;
    this.highlightManager = new HighlightManager(pitch);
    this.dice = new DiceWatch(eventBus);
    this.confirmations = new Confirmations(eventBus);
    this.targets = new BiteAndSpellTargets({ gameService,scene,pitch,playerAt: (x,y) => this.getPlayerAt(x,y) }    );
    this.push = new PushPicker(gameService, eventBus, this.highlightManager);
    this.passController = gameService.getPassController();
    this.scene.events.on("postupdate", this.publishTargetPreview);

    this.pushDirectionHandler = (data) => {
      this.push.start(data);
    };

    this.resumeBlitzMoveHandler = (data) => {
      resumeBlitzMove(this, data.playerId);
    };

    
    
    
    

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    this.bindInputEvents();
    this.bindGameEvents();
    this.bindKickoffEvents();
  }

  private bindInputEvents(): void {
    this.eventBus.on( GameEventNames.UI_SelectPushDirection, this.pushDirectionHandler );
    this.eventBus.on( GameEventNames.UI_ResumeBallAndChain, this.resumeBallAndChain );
    this.eventBus.on(GameEventNames.UI_ActionSelected, (data) => { void this.onActionSelected(data); });
    this.eventBus.on(GameEventNames.UI_StepSelected, this.onStepSelected);
    this.eventBus.on(GameEventNames.UI_CancelAction, this.onCancelAction);
    this.eventBus.on(GameEventNames.UI_EndActivation, this.onEndActivation);
    this.eventBus.on(GameEventNames.UI_WizardTargeting, this.onWizardTargeting);
    this.eventBus.on(GameEventNames.UI_GoMovePlan, this.onGoMovePlan);
    this.eventBus.on(GameEventNames.UI_ClearMovePlan, this.onClearMovePlan);
    this.eventBus.on( GameEventNames.UI_ResumeBlitzMove, this.resumeBlitzMoveHandler );
  }

  private bindGameEvents(): void {
    this.eventBus.on(GameEventNames.DecisionResolved, this.onDecisionResolved);
    this.eventBus.on( GameEventNames.DecisionRequested, this.onDecisionRequested );
    this.eventBus.on( GameEventNames.RazzleDazzleSecondAction, this.onRazzleDazzleSecondAction );
    this.eventBus.on( GameEventNames.NetworkCommandRejected, this.onNetworkCommandRejected );
    this.eventBus.on(GameEventNames.GameStateRestored, this.resumeActivePlayer);
    this.eventBus.on(GameEventNames.GameStateRestored, this.onStateRestored);
    this.eventBus.on(GameEventNames.PhaseChanged, this.onPhaseChangedReset);
  }

  private bindKickoffEvents(): void {
    this.eventBus.on( GameEventNames.KickoffEventStepStarted, this.kickoffStepSyncHandler );
    this.eventBus.on( GameEventNames.KickoffEventStepResolved, this.kickoffStepSyncHandler );
    this.eventBus.on( GameEventNames.KickoffEventStepChanged, this.kickoffStepSyncHandler );
    this.eventBus.on(GameEventNames.UI_SyncBoard, this.kickoffStepSyncHandler);
    this.eventBus.on(GameEventNames.PlayerMoved, this.kickoffStepSyncHandler);
    this.eventBus.on(GameEventNames.PlayerPlaced, this.kickoffStepSyncHandler);
    this.eventBus.on(GameEventNames.PlayerRemoved, this.kickoffStepSyncHandler);
    this.eventBus.on( GameEventNames.PlayerSelected, this.kickoffPlayerSelectedHandler );
  }

  private onDecisionRequested = (request: DecisionRequest) => {
    if (request.type === "bite-target") this.targets.markBiteTargets(request);
  };

  private onStateRestored = () => {
    this.targets.clearBiteTargets();
    this.targets.markPendingBite();
  };

  private onWizardTargeting = ({ spell }: { spell: WizardSpell | null }) => {
    this.targets.aimSpell(spell);
  };

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

  private onEndActivation = () => {
    endActivation(this);
  };

  private onRazzleDazzleSecondAction = ({ playerId }: { playerId: string }) => {
    setTimeout(() => {
      const active = this.gameService.getState().activePlayer;
      if (active?.id === playerId && active.razzleDazzle?.awaitingSecond) {
        this.selectPlayer(playerId);
      }
    }, 50);
  };

  private onCancelAction = () => {
    cancelAction(this);
  };

  private onNetworkCommandRejected = (
    data: Parameters<typeof reconcileRejectedCommand>[1]
  ) => {
    reconcileRejectedCommand(this, data);
  };

  private onStepSelected = (data: { stepId: string }) => {
    selectStep(this, data);
  };

  private onActionSelected = (data: Parameters<typeof selectAction>[1]) =>
    selectAction(this, data);

  private resumeBallAndChain = (data: { playerId: string }) => {
    resumeBallAndChain(this, data.playerId);
  };

  private resumeActivePlayer = () => {
    resumeActivePlayer(this);
  };

  public handlePointerDown(
    pointer: { worldX: number; worldY: number },
    isSetupActive: boolean
  ): void {
    if (isSetupActive) return;

    if (getActiveOnlineMatch()?.mayAct() === false) return;

    const margin = this.push.active ? 1 : 0;
    const { valid, gridX, gridY } = this.getGridFromPointer(pointer, margin);
    const square = this.pitch.worldToGrid(pointer.worldX, pointer.worldY);
    if (valid) {
      void this.onSquareClicked(gridX, gridY);
    } else if (this.passesAtWall(square)) {
      void this.onSquareClicked(square.x, square.y);
    } else if (!this.push.active) {
      this.deselectPlayer();
    }
  }

  public passesAtWall(square: { x: number; y: number }): boolean {
    return (
      this.currentActionMode === "pass" &&
      this.currentStepId === "pass" &&
      isWallSquare(square)
    );
  }

  public handlePointerMove(
    pointer: Phaser.Input.Pointer,
    isSetupActive: boolean
  ): void {
    if (isSetupActive) return;

    const { valid, gridX, gridY } = this.getGridFromPointer(pointer);
    if (valid) {
      if (
        this.lastHoverGrid?.x !== gridX ||
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
      this.eventBus.emit(GameEventNames.UI_HidePlayerInfo, undefined);
    }
  }

  private getGridFromPointer(
    pointer: { worldX: number; worldY: number },
    marginSquares = 0
  ): {
    valid: boolean;
    gridX: number;
    gridY: number;
  } {
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

  private consumesSquareClick(x: number, y: number): boolean {
    if (this.targets.handleBiteTargetClick(this.getPlayerAt(x, y)?.id)) return true;
    if (this.targets.handleSpellClick(x, y)) return true;
    if (this.isBusy) return true;
    return this.push.click(x, y) || this.push.active;
  }

  async onSquareClicked(x: number, y: number): Promise<void> {
    if (this.consumesSquareClick(x, y)) return;

    const phase = this.gameService.getPhase();
    const playerAtSquare = this.getPlayerAt(x, y);

    if (this.jumpTargeting && this.selectedPlayerId) {
      await handleJumpClick({ c: this,playerId: this.selectedPlayerId,x,y });
      return;
    }

    if (
      phase === GamePhase.KICKOFF &&
      !this.gameService.getKickoffEventStep()?.charge?.activePlayerId
    ) {
      handleKickoffClick({ c: this,x,y,playerAtSquare });
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

    const player = this.getPlayerAt(x, y);
    if (player) {
      this.eventBus.emit(GameEventNames.UI_ShowPlayerInfo, player);
    } else {
      this.eventBus.emit(GameEventNames.UI_HidePlayerInfo, undefined);
    }
    previewSquare(this, x, y);
  }

  private consumesPlayerTarget(playerId: string): boolean {
    if (this.targets.handleBiteTargetClick(playerId)) return true;
    const square = this.gameService.getPlayerById(playerId)?.gridPosition;
    return Boolean(square && this.targets.handleSpellClick(square.x, square.y));
  }

  private consumesPushClick(playerId: string): boolean {
    if (!this.push.active) return false;
    const clicked = this.gameService.getPlayerById(playerId);
    if (clicked?.gridPosition) this.push.click(clicked.gridPosition.x, clicked.gridPosition.y);
    return true;
  }

  public handlePlayerClick(playerId: string): void {
    if (getActiveOnlineMatch()?.mayAct() === false) return;

    if (this.consumesPlayerTarget(playerId)) return;
    if (this.isBusy) return;
    console.log(
      `[Interaction] handlePlayerClick: ${playerId}. Mode: ${String(this.currentActionMode)}, Step: ${String(this.currentStepId)}, Selected: ${String(this.selectedPlayerId)}`
    );

    if (this.consumesPushClick(playerId)) return;

    if (kickoffPlayerClick(this, playerId)) return;

    const target = playerClickTarget(this, playerId);
    if (target) {
      void this.onSquareClicked(target.x, target.y);
      return;
    }

    if (this.selectedPlayerId === playerId) {
      console.log(
        "[Interaction] Clicked self, ignoring re-selection to preserve state."
      );
      return;
    }

    console.log("[Interaction] Defaulting to selection change.");
    this.selectPlayer(playerId);
  }

  public selectPlayer(playerId: string): void {
    selectPlayer(this, playerId);
  }

  public deselectPlayer(): void {
    if (this.push.active) return;

    if (this.selectedPlayerId) {
      this.scene.unhighlightPlayer(this.selectedPlayerId);
      this.selectedPlayerId = null;
    }
    this.clearWaypoints();
    this.clearRollPreviews();
    this.clearAllInteractionHighlights();

    this.pitch.clearHighlights();
    this.pitch.clearPath();

    this.currentActionMode = null;
    this.currentBlockReplacement = null;
    this.currentStepId = null;
    this.jumpTargeting = false;
    this.actionSteps = [];
    this.hasMovedInAction = false;
    this.pitch.clearPassVisualization();

    this.interactionSeq++;

    this.eventBus.emit(GameEventNames.PlayerSelected, { player: null });
  }

  declareMoveIfNone(playerId: string, action?: string | null): boolean {
    const active = this.gameService.getState().activePlayer;
    if (active?.id === playerId && active.razzleDazzle?.awaitingSecond) {
      return this.gameService.declareAction({ playerId: playerId, action: "move" });
    }
    if (!action) {
      this.gameService.declareAction({ playerId: playerId, action: "move" });
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

  public startRouteDrag(world: { worldX: number; worldY: number }): boolean {
    const { valid, gridX, gridY } = this.getGridFromPointer(world);
    if (!valid) return false;
    const owner = routeOwnerAt(this, gridX, gridY);
    if (!owner) return false;
    if (owner.id !== this.selectedPlayerId) this.selectPlayer(owner.id);
    if (this.selectedPlayerId !== owner.id) return false;

    const asked = askGates(this, owner.id, "move");
    if (asked) {
      void asked.then((ok) => ok && this.declareMoveIfNone(owner.id));
      return false;
    }
    return true;
  }

  public dragRouteTo(world: { worldX: number; worldY: number }): void {
    const id = this.selectedPlayerId;
    const player = id ? this.gameService.getPlayerById(id) : undefined;
    const start = player?.gridPosition;
    if (!player || !start) return;
    const { valid, gridX, gridY } = this.getGridFromPointer(world);
    if (!valid) return;
    dragRouteTo({ c: this,player,start,x: gridX,y: gridY });
  }

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

    this.eventBus.emit(GameEventNames.UI_PassAimed, null);
  }

  private onGoMovePlan = (): void => {
    goMovePlan(this);
  };

  private onClearMovePlan = (): void => {
    clearMovePlan(this);
  };

  public destroy(): void {
    this.confirmations.dropAll();
    this.scene.events.off("postupdate", this.publishTargetPreview);
    this.clearRollPreviews();
    this.dice.dispose();
    this.disposeHandlers();
    this.targets.clearBiteTargets();
    this.highlightManager.destroy();
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

  syncKickoffStepInteraction(): void {
    syncKickoffStep(this);
  }

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
      players.find((p) => p.gridPosition?.x === x && p.gridPosition.y === y) ??
      null
    );
  }

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

  public clearAllInteractionHighlights(): void {
    this.highlightManager.clearAllHighlights();
  }
}

import { IEventBus } from "../../services/EventBus";
import { GameState } from "@/types/GameState";
import { Team } from "@/types/Team";
import { Player, PlayerStatus } from "@/types/Player";
import { BlockValidator } from "../validators/BlockValidator";
import {
  BlockResolutionService,
  BlockResult,
  BlockResultType,
  BlockRollData,
} from "../../services/BlockResolutionService";
import { GameEventNames } from "../../types/events";
import { ArmourOperation } from "../operations/ArmourOperation.js";
import { BounceOperation } from "../operations/BounceOperation";
import { CrowdInjuryOperation } from "../operations/CrowdInjuryOperation";
import { GameConfig } from "../../config/GameConfig";
import { DiceController } from "../controllers/DiceController";
import { GameOperation } from "../core/GameOperation";
import { FlowContext } from "../core/GameFlowManager";
import {
  foldBlockResult,
  foldTrigger,
  gatherParticipants,
  adjacentStanding,
  BlockResultContext,
  BlockDeclaredContext,
  PushContext,
} from "../skills";

/**
 * Offers the blocker the follow-up into the square their crowd-surfed
 * victim vacated. Queued at the BACK of the flow so the crowd injury and
 * throw-in chain fully settle (ball at rest) before the prompt; the
 * blocker's activation then ends with the follow-up reply, never before.
 */
class CrowdSurfFollowUpOperation extends GameOperation {
  public readonly name = "CrowdSurfFollowUp";

  constructor(
    private attackerId: string,
    private targetSquare: { x: number; y: number }
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    context.eventBus.emit(GameEventNames.UI_FollowUpPrompt, {
      attackerId: this.attackerId,
      targetSquare: this.targetSquare,
    });
  }
}

export class BlockManager {
  private blockValidator: BlockValidator = new BlockValidator();

  constructor(
    private eventBus: IEventBus,
    private state: GameState,
    private team1: Team,
    private team2: Team,
    private blockResolutionService: BlockResolutionService,
    private diceController: DiceController,
    private callbacks: {
      onTurnover: (reason: string) => void;
      getFlowManager?: () => import("../core/GameFlowManager").GameFlowManager;
    }
  ) {}

  public previewBlock(attackerId: string, defenderId: string): void {
    const attacker = this.getPlayerById(attackerId);
    const defender = this.getPlayerById(defenderId);

    if (!attacker || !defender) {
      console.error("Player not found for block");
      return;
    }

    const allPlayers = [...this.team1.players, ...this.team2.players];
    const analysis = this.blockValidator.analyzeBlock(
      attacker,
      defender,
      allPlayers
    );

    this.eventBus.emit(GameEventNames.UI_BlockDialog, {
      attackerId,
      defenderId,
      analysis,
    });
  }

  /**
   * Roll block dice and emit results
   */
  public async rollBlockDice(
    attackerId: string,
    defenderId: string,
    numDice: number,
    isAttackerChoice: boolean
  ): Promise<void> {
    const attacker = this.getPlayerById(attackerId);
    const defender = this.getPlayerById(defenderId);

    // Trigger point: block declared — rules may adjust the dice before they
    // roll (pre-block rolls, dice-count effects)
    if (attacker && defender) {
      const ctx: BlockDeclaredContext = {
        attacker,
        defender,
        diceCount: numDice,
        isAttackerChoice,
        decisions: this.decisions(),
        flow: this.callbacks.getFlowManager?.(),
        triggers: [],
      };
      await foldTrigger(
        "onBlockDeclared",
        this.blockParticipants(attacker, defender),
        ctx
      );
      this.announce(ctx.triggers);
      numDice = ctx.diceCount;
      isAttackerChoice = ctx.isAttackerChoice;
    }

    const teamId = attackerId.split("-")[0];
    const results = this.diceController.rollBlockDice(numDice, teamId);

    const rollData: BlockRollData = {
      attackerId,
      defenderId,
      numDice,
      isAttackerChoice,
      results,
    };

    this.eventBus.emit(GameEventNames.BlockDiceRolled, rollData);
  }

  /**
   * Resolve block with selected result
   */
  public async resolveBlock(
    attackerId: string,
    defenderId: string,
    result: BlockResult
  ): Promise<void> {
    const attacker = this.getPlayerById(attackerId);
    const defender = this.getPlayerById(defenderId);

    if (!attacker || !defender) {
      console.error("Player not found for block resolution");
      return;
    }

    switch (result.type) {
      case "skull":
        this.handleSkull(attacker);
        break;
      case "both-down":
        await this.handleBothDown(attacker, defender);
        break;
      case "push":
      case "pow":
      case "pow-dodge": {
        // Trigger point: block result — rules may cancel the knockdown
        // (Dodge turns a Defender Stumbles into a plain push unless the
        // attacker has Tackle)
        const resultCtx: BlockResultContext = {
          attacker,
          defender,
          resultType: result.type,
          attackerKnockedDown: false,
          defenderKnockedDown:
            result.type === "pow" || result.type === "pow-dodge",
          decisions: this.decisions(),
          flow: this.callbacks.getFlowManager?.(),
          triggers: [],
        };
        await foldBlockResult(resultCtx, this.allPlayers());
        this.announce(resultCtx.triggers);

        // Trigger point: the defender is about to be pushed — a reacting
        // rule may refuse the push outright (Stand Firm)
        const pushCtx: PushContext = {
          attacker,
          pushed: defender,
          resultType: result.type,
          refused: false,
          decisions: this.decisions(),
          flow: this.callbacks.getFlowManager?.(),
          triggers: [],
        };
        await foldTrigger(
          "onPush",
          this.blockParticipants(attacker, defender),
          pushCtx
        );
        this.announce(pushCtx.triggers);

        if (pushCtx.refused) {
          this.resolveRefusedPush(
            attacker,
            defender,
            resultCtx.defenderKnockedDown
          );
          break;
        }

        // Start a (possibly chained) push: the chain is decided link by
        // link, applied only once fully chosen (rulebook p.55)
        this.chain = {
          attackerId,
          resultType: result.type,
          knockDownDefender: resultCtx.defenderKnockedDown,
          links: [],
        };
        this.requestPushDecision(attacker.gridPosition!, defender);
        break;
      }
    }
  }

  /**
   * A refused push (Stand Firm): nobody moves, so there is no chain and no
   * follow-up. POW results still knock the defender down — in place.
   */
  private resolveRefusedPush(
    attacker: Player,
    defender: Player,
    knockDownDefender: boolean
  ): void {
    const flowManager = this.callbacks.getFlowManager?.();

    if (knockDownDefender) {
      this.knockDownPlayer(defender);
      if (flowManager) {
        flowManager.add(new ArmourOperation(defender.id, attacker.id), true);
        const pos = defender.gridPosition;
        if (
          pos &&
          this.state.ballPosition &&
          this.state.ballPosition.x === pos.x &&
          this.state.ballPosition.y === pos.y
        ) {
          flowManager.add(new BounceOperation(pos), true);
        }
      }
    }

    // No square was vacated, so the follow-up prompt never fires — end the
    // blocker's activation directly
    flowManager?.context.gameService.finishActivation(attacker.id);
  }

  /** Pending chain-push state between push-direction decisions */
  private chain: {
    attackerId: string;
    resultType: BlockResultType;
    /** Whether the original defender goes down (skills may have cancelled) */
    knockDownDefender?: boolean;
    links: {
      playerId: string;
      from: { x: number; y: number };
      to: { x: number; y: number } | null; // null = pushed into the crowd
    }[];
  } | null = null;

  private requestPushDecision(
    pusherPos: { x: number; y: number },
    pushed: Player
  ): void {
    const { options, tier } = this.blockResolutionService.getPushOptions(
      pusherPos,
      pushed.gridPosition!,
      (x, y) => this.getPlayerAt(x, y) !== undefined
    );

    this.eventBus.emit(GameEventNames.UI_SelectPushDirection, {
      defenderId: pushed.id,
      validDirections: options,
      canFollowUp: this.blockResolutionService.allowsFollowUp(
        this.chain!.resultType
      ),
      resultType: this.chain!.resultType,
      attackerId: this.chain!.attackerId, // chooser is always the blocker
      pushTier: tier,
    });
  }

  private getPlayerAt(x: number, y: number): Player | undefined {
    return [...this.team1.players, ...this.team2.players].find(
      (p) =>
        p.gridPosition && p.gridPosition.x === x && p.gridPosition.y === y
    );
  }

  /**
   * Record the chosen push direction for the currently awaited player.
   * Occupied target: the occupant is pushed onward (chain, rulebook p.55).
   * Off-pitch target: pushed into the crowd. Otherwise the chain is
   * complete and all links apply, innermost first.
   */
  public executePush(
    attackerId: string,
    defenderId: string,
    direction: { x: number; y: number },
    resultType: string,
    followUp: boolean
  ): void {
    const defender = this.getPlayerById(defenderId);
    if (!defender || !defender.gridPosition) return;

    if (!this.chain) {
      // Direct call without resolveBlock (tests/tools): start a chain now
      this.chain = {
        attackerId,
        resultType: resultType as BlockResultType,
        knockDownDefender: resultType === "pow" || resultType === "pow-dodge",
        links: [],
      };
    }

    const from = { ...defender.gridPosition };
    const onPitch =
      direction.x >= 0 &&
      direction.x < GameConfig.PITCH_WIDTH &&
      direction.y >= 0 &&
      direction.y < GameConfig.PITCH_HEIGHT;

    if (!onPitch) {
      // Pushed into the crowd: chain ends at this link
      this.chain.links.push({ playerId: defenderId, from, to: null });
      this.applyChain(followUp);
      return;
    }

    this.chain.links.push({ playerId: defenderId, from, to: direction });

    const occupant = this.getPlayerAt(direction.x, direction.y);
    if (occupant && occupant.id !== defenderId) {
      // Chain push: the occupant is pushed as if by the incoming player;
      // the blocking coach keeps choosing directions
      this.requestPushDecision(from, occupant);
      return;
    }

    this.applyChain(followUp);
  }

  /** Apply all chain links innermost-first, then knockdown/follow-up. */
  private applyChain(followUp: boolean): void {
    if (!this.chain) return;
    const { attackerId, resultType, links } = this.chain;
    const knockDownDefender =
      this.chain.knockDownDefender ??
      (resultType === "pow" || resultType === "pow-dodge");
    this.chain = null;

    const flowManager = this.callbacks.getFlowManager?.();

    for (let i = links.length - 1; i >= 0; i--) {
      const link = links[i];
      const player = this.getPlayerById(link.playerId);
      if (!player) continue;

      if (link.to === null) {
        // Crowd surf: off the pitch; injury without armour, ball throw-in
        // and turnover handled by the operation. Whether it's a turnover is
        // decided NOW — by the time the operation runs the turn may have
        // ended (auto end-turn on the blocker's last activation)
        player.gridPosition = undefined;
        this.eventBus.emit(GameEventNames.PlayerPushedIntoCrowd, {
          playerId: link.playerId,
          exitSquare: link.from,
        });
        if (flowManager) {
          const isTurnover =
            player.teamId === flowManager.context.gameService.getActiveTeamId();
          flowManager.add(
            new CrowdInjuryOperation(link.playerId, link.from, isTurnover),
            true
          );
        }
        continue;
      }

      player.gridPosition = { ...link.to };

      // A pushed player keeps hold of the ball
      const carriedBall =
        this.state.ballPosition &&
        this.state.ballPosition.x === link.from.x &&
        this.state.ballPosition.y === link.from.y;
      if (carriedBall) {
        this.state.ballPosition = { ...link.to };
        this.eventBus.emit(GameEventNames.BallPlaced, { ...link.to });
      }

      const isOriginalDefender = i === 0;
      this.eventBus.emit(GameEventNames.PlayerMoved, {
        playerId: link.playerId,
        from: link.from,
        to: link.to,
        path: [link.from, link.to],
        ballFrom: carriedBall ? link.from : undefined,
        ballPath: carriedBall ? [link.from, link.to] : undefined,
        ballJoinStep: 0,
        followUpData:
          isOriginalDefender && !followUp
            ? { attackerId, targetSquare: link.from }
            : undefined,
      });

      // A standing carrier pushed into their scoring end zone still scores
      // (the original defender falls on POW, so no score for them)
      const knockedDown = isOriginalDefender && knockDownDefender;
      if (!knockedDown) {
        flowManager?.context.gameService.checkForTouchdown(link.playerId);
      }
    }

    // Knockdown applies only to the original defender on POW results
    const first = links[0];
    if (first && first.to === null) {
      // Defender surfed: the blocker is still offered the follow-up into
      // the vacated square. Queued at the BACK so the crowd injury +
      // throw-in settle first — the ball must be at rest and the follow-up
      // answered before the activation (and possibly the turn) ends
      flowManager?.add(new CrowdSurfFollowUpOperation(attackerId, first.from));
      return;
    }
    if (first && first.to !== null && knockDownDefender) {
      const defender = this.getPlayerById(first.playerId);
      if (defender) {
        this.knockDownPlayer(defender);
        if (flowManager) {
          // A knocked-down carrier drops the ball where they landed
          // (added after ArmourOperation so the bounce resolves first)
          flowManager.add(new ArmourOperation(first.playerId, attackerId), true);
          if (
            this.state.ballPosition &&
            this.state.ballPosition.x === first.to.x &&
            this.state.ballPosition.y === first.to.y
          ) {
            flowManager.add(new BounceOperation(first.to), true);
          }
        }
      }
    }
  }

  /**
   * Handle skull result (attacker down)
   */
  private handleSkull(attacker: Player): void {
    this.knockDownPlayer(attacker);

    const flowManager = this.callbacks.getFlowManager?.();
    if (flowManager) {
      flowManager.add(new ArmourOperation(attacker.id), true);
    }

    this.callbacks.onTurnover("Attacker Down (Skull)");
  }

  /**
   * Handle both down result
   */
  private async handleBothDown(
    attacker: Player,
    defender: Player
  ): Promise<void> {
    // Skill hook: rules may cancel a knock-down (Block ignores Both Down)
    // or choose both-prone-no-armour (Wrestle, a reacting-team decision).
    const ctx: BlockResultContext = {
      attacker,
      defender,
      resultType: "both-down",
      attackerKnockedDown: true,
      defenderKnockedDown: true,
      decisions: this.decisions(),
      flow: this.callbacks.getFlowManager?.(),
      triggers: [],
    };
    await foldBlockResult(ctx, this.allPlayers());
    this.announce(ctx.triggers);

    const attackerHadBall = this.isOnBall(attacker);

    if (ctx.attackerKnockedDown) this.knockDownPlayer(attacker);
    if (ctx.defenderKnockedDown) this.knockDownPlayer(defender);

    const flowManager = this.callbacks.getFlowManager?.();
    if (flowManager) {
      // A downed carrier drops the ball (prone players can't hold it)
      [defender, attacker].forEach((p) => {
        const down =
          p === attacker ? ctx.attackerKnockedDown : ctx.defenderKnockedDown;
        if (down && this.isOnBall(p)) {
          flowManager.add(new BounceOperation(p.gridPosition!), true);
        }
      });

      // Only the players actually knocked down roll armour — none at all
      // when a rule placed them prone (Wrestle). Attacker runs first
      // (added last to the front of the queue). Only the attacker "caused"
      // a knockdown (2025 Mighty Blow: the defender performed no block).
      if (!ctx.placedProne) {
        if (ctx.defenderKnockedDown) {
          flowManager.add(new ArmourOperation(defender.id, attacker.id), true);
        }
        if (ctx.attackerKnockedDown) {
          flowManager.add(new ArmourOperation(attacker.id), true);
        }
      }
    }

    if (ctx.attackerKnockedDown) {
      if (!ctx.placedProne) {
        // A turnover happens only if the active player (the attacker) went
        // down.
        this.callbacks.onTurnover("Both Down");
      } else if (attackerHadBall) {
        // Placed Prone (p.42): a turnover only if the active player was
        // carrying the ball; otherwise just the activation ends
        this.callbacks.onTurnover("Ball carrier placed prone");
      } else {
        flowManager?.context.gameService.finishActivation(attacker.id);
      }
    }
  }

  private isOnBall(player: Player): boolean {
    return (
      !!player.gridPosition &&
      !!this.state.ballPosition &&
      this.state.ballPosition.x === player.gridPosition.x &&
      this.state.ballPosition.y === player.gridPosition.y
    );
  }

  /**
   * Knock down a player
   */
  private knockDownPlayer(player: Player): void {
    player.status = PlayerStatus.PRONE;
    this.eventBus.emit(GameEventNames.PlayerKnockedDown, {
      playerId: player.id,
    });
  }

  private getPlayerById(playerId: string): Player | undefined {
    return (
      this.team1.players.find((p) => p.id === playerId) ||
      this.team2.players.find((p) => p.id === playerId)
    );
  }

  private allPlayers(): Player[] {
    return [...this.team1.players, ...this.team2.players];
  }

  private decisions() {
    return this.callbacks
      .getFlowManager?.()
      ?.context.gameService.getDecisionService();
  }

  /** Attacker → defender → players adjacent to either, by position. */
  private blockParticipants(attacker: Player, defender: Player): Player[] {
    const all = this.allPlayers();
    const adjacents = [
      ...(attacker.gridPosition
        ? adjacentStanding(attacker.gridPosition, all)
        : []),
      ...(defender.gridPosition
        ? adjacentStanding(defender.gridPosition, all)
        : []),
    ];
    return gatherParticipants(attacker, defender, adjacents);
  }

  private announce(
    triggers: { playerId: string; skill: string; effect: string }[]
  ): void {
    triggers.forEach((t) =>
      this.eventBus.emit(GameEventNames.SkillTriggered, t)
    );
  }
}

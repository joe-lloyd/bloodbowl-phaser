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

/**
 * Ends the blocker's activation after a crowd surf resolves. Queued behind
 * the crowd injury so the throw-in/bounce chain settles before a possible
 * auto end-turn.
 */
class FinishActivationOperation extends GameOperation {
  public readonly name = "FinishActivation";

  constructor(private playerId: string) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    context.gameService.finishActivation(this.playerId);
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
  public rollBlockDice(
    attackerId: string,
    defenderId: string,
    numDice: number,
    isAttackerChoice: boolean
  ): void {
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
  public resolveBlock(
    attackerId: string,
    defenderId: string,
    result: BlockResult
  ): void {
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
        this.handleBothDown(attacker, defender);
        break;
      case "push":
      case "pow":
      case "pow-dodge": {
        // Start a (possibly chained) push: the chain is decided link by
        // link, applied only once fully chosen (rulebook p.55)
        this.chain = {
          attackerId,
          resultType: result.type,
          links: [],
        };
        this.requestPushDecision(attacker.gridPosition!, defender);
        break;
      }
    }
  }

  /** Pending chain-push state between push-direction decisions */
  private chain: {
    attackerId: string;
    resultType: BlockResultType;
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
        followUpData:
          isOriginalDefender && !followUp
            ? { attackerId, targetSquare: link.from }
            : undefined,
      });

      // A standing carrier pushed into their scoring end zone still scores
      // (the original defender falls on POW, so no score for them)
      const knockedDown =
        isOriginalDefender &&
        (resultType === "pow" || resultType === "pow-dodge");
      if (!knockedDown) {
        flowManager?.context.gameService.checkForTouchdown(link.playerId);
      }
    }

    // Knockdown applies only to the original defender on POW results
    const first = links[0];
    if (first && first.to === null) {
      // Defender surfed: no follow-up decision is offered (follow-up onto
      // the vacated square is a future refinement), so the attacker's
      // activation ends instead of via the follow-up reply. Queued at the
      // BACK so the crowd injury + throw-in settle first — finishing the
      // last activation can auto-end the turn, and the ball must be at
      // rest before the turn changes
      flowManager?.add(new FinishActivationOperation(attackerId));
      return;
    }
    if (
      first &&
      first.to !== null &&
      (resultType === "pow" || resultType === "pow-dodge")
    ) {
      const defender = this.getPlayerById(first.playerId);
      if (defender) {
        this.knockDownPlayer(defender);
        if (flowManager) {
          // A knocked-down carrier drops the ball where they landed
          // (added after ArmourOperation so the bounce resolves first)
          flowManager.add(new ArmourOperation(first.playerId), true);
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
  private handleBothDown(attacker: Player, defender: Player): void {
    this.knockDownPlayer(attacker);
    this.knockDownPlayer(defender);

    const flowManager = this.callbacks.getFlowManager?.();
    if (flowManager) {
      // Add both to queue (next: true means they get processed in order they were added to front?)
      // unshift(defender), then unshift(attacker) -> attacker runs FIRST.
      flowManager.add(new ArmourOperation(defender.id), true);
      flowManager.add(new ArmourOperation(attacker.id), true);
    }

    this.callbacks.onTurnover("Both Down");
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
}

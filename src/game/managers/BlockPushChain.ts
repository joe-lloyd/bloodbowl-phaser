import {
  Player,
  PlayerCondition,
  addCondition,
  hasCondition,
} from "@/types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { BlockResultType } from "../../services/BlockResolutionService";
import { GameEventNames } from "../../types/events";
import { ArmourOperation } from "../operations/ArmourOperation.js";
import { BounceOperation } from "../operations/BounceOperation";
import { CrowdInjuryOperation } from "../operations/CrowdInjuryOperation";
import { trapdoorOpens } from "../inducements/matchInducements";
import { GameConfig } from "../../config/GameConfig";
import { PushContext, foldTrigger } from "../skills";
import { steadyFootingSaves } from "../rules/steadyFooting";
import { FrenzyOperation, InOrderOperation } from "./BlockOperations";
import { BlockActivation } from "./BlockActivation";

type Square = { x: number; y: number };

/** One pushed player in a chain push. */
type PushLink = {
  playerId: string;
  from: Square;
  to: Square | null; // null = pushed into the crowd
};

/** Pending chain-push state between push-direction decisions */
type PushChain = {
  attackerId: string;
  resultType: BlockResultType;
  /** Whether the original defender goes down (skills may have cancelled) */
  knockDownDefender?: boolean;
  /** Fend denied the blocker their follow-up */
  preventFollowUp?: boolean;
  /** Strip Ball: the pushed carrier drops the ball where they land */
  stripBall?: boolean;
  /** Eye Gouge: the Block's target is Eye Gouged once pushed */
  eyeGouge?: boolean;
  /** Grab: the blocker picks any unoccupied square adjacent to the target */
  grabPush?: boolean;
  /** Sidestep: the player pushed in the current link picks the square */
  sideStepPush?: boolean;
  /** Juggernaut on a Blitz: Stand Firm is cancelled down the whole chain */
  blockerIgnoresReactions?: boolean;
  /** Taunt / Frenzy: the blocker must follow up — no follow-up choice offered */
  forceFollowUp?: boolean;
  /** Frenzy's FIRST block: force follow-up + a mandatory second block. */
  frenzy?: boolean;
  links: PushLink[];
};

/** Who left the board or landed on a loose ball while the chain applied. */
type ChainLanding = {
  /** Treacherous Trapdoor (L12): pushed players who fell through. */
  fellThrough: Set<string>;
  landedOnLooseBall: Set<string>;
};

const isPow = (resultType: string): boolean =>
  resultType === "pow" || resultType === "pow-dodge";

/**
 * The Push Back: the push reactions, the chain of pushed players decided
 * link by link, then the moves, knockdown and follow-up once it is chosen.
 */
export abstract class BlockPushChain extends BlockActivation {
  /** Pending chain-push state between push-direction decisions */
  protected chain: PushChain | null = null;

  /**
   * Fold the push reactions (Stand Firm / Fend / Strip Ball / Grab) and start
   * the (possibly chained) push, or resolve it in place if refused. Shared by
   * plain push/POW results and by Juggernaut converting a Both Down.
   */
  protected async beginPush(
    attacker: Player,
    defender: Player,
    resultType: BlockResultType,
    knockDownDefender: boolean
  ): Promise<void> {
    const pushCtx: PushContext = {
      attacker,
      pushed: defender,
      resultType,
      isBlitz: this.isBlitzBlock(attacker),
      pushedHasBall: this.isOnBall(defender),
      blockerIgnoresReactions: false,
      refused: false,
      preventFollowUp: false,
      stripBall: false,
      eyeGouge: false,
      grabPush: false,
      sideStepPush: false,
      forceFollowUp: false,
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
    this.constrainPush(pushCtx);

    // Frenzy: the blocker MUST follow up a Push Back, and — on the first block
    // only — must throw a second Block at the same player if they are still
    // Standing. `frenzyExtraFor` marks the second (extra) block so it doesn't
    // spawn a third.
    const frenzyFollowUp =
      hasSkill(attacker.skills, SkillType.FRENZY) &&
      this.multipleBlockState?.attackerId !== attacker.id &&
      !pushCtx.preventFollowUp;
    const frenzy = frenzyFollowUp && this.frenzyExtraFor !== attacker.id;
    if (frenzyFollowUp) {
      pushCtx.forceFollowUp = true; // both the first and the extra block
    }

    if (pushCtx.refused) {
      await this.resolveRefusedPush(
        attacker,
        defender,
        knockDownDefender,
        frenzy
      );
      return;
    }

    // Start a (possibly chained) push: the chain is decided link by link,
    // applied only once fully chosen (rulebook p.55)
    this.chain = {
      attackerId: attacker.id,
      resultType,
      knockDownDefender,
      preventFollowUp: pushCtx.preventFollowUp,
      stripBall: pushCtx.stripBall,
      eyeGouge: pushCtx.eyeGouge,
      grabPush: pushCtx.grabPush,
      sideStepPush: pushCtx.sideStepPush,
      forceFollowUp: pushCtx.forceFollowUp,
      frenzy,
      blockerIgnoresReactions: pushCtx.blockerIgnoresReactions,
      links: [],
    };
    this.requestPushDecision(this.chain, attacker.gridPosition!, defender);
  }

  /** Conditions and compound actions that overrule the push reactions. */
  private constrainPush(pushCtx: PushContext): void {
    const { attacker, pushed: defender } = pushCtx;
    // Rooted players cannot be Pushed Back for any reason — a condition,
    // not a skill reaction, so Juggernaut's cancel does not apply
    if (hasCondition(defender, PlayerCondition.ROOTED)) {
      pushCtx.refused = true;
      this.announce([
        {
          playerId: defender.id,
          skill: SkillType.TAKE_ROOT,
          effect: "Rooted: cannot be pushed back",
        },
      ]);
    }
    // A Rooted attacker may never follow up
    if (hasCondition(attacker, PlayerCondition.ROOTED)) {
      pushCtx.preventFollowUp = true;
    }
    if (this.multipleBlockState?.attackerId === attacker.id) {
      // Multiple Block never permits a Follow-up and cannot combine with
      // Frenzy's forced follow-up/extra block.
      pushCtx.preventFollowUp = true;
      pushCtx.forceFollowUp = false;
    }
    // Ball & Chain: the Fanatic is moving into the square, not following
    // up, so it always enters a square the push empties (Fend included)
    if (this.isBallAndChain(attacker)) {
      pushCtx.preventFollowUp = false;
      pushCtx.forceFollowUp = true;
    }
  }

  /**
   * A refused push (Stand Firm): nobody moves, so there is no chain and no
   * follow-up. POW results still knock the defender down — in place. Stand
   * Firm "will not prevent a player with the Frenzy Skill from performing a
   * second Block Action, so long as this player is still Standing" (p.136).
   */
  private async resolveRefusedPush(
    attacker: Player,
    defender: Player,
    knockDownDefender: boolean,
    frenzy: boolean
  ): Promise<void> {
    const flowManager = this.callbacks.getFlowManager?.();

    if (
      knockDownDefender &&
      (await steadyFootingSaves(
        defender,
        this.diceController,
        this.eventBus,
        flowManager?.context.gameService
      ))
    ) {
      knockDownDefender = false;
    }
    if (knockDownDefender) {
      this.knockDownOnSquare(attacker.id, defender, defender.gridPosition);
    }

    if (frenzy && !knockDownDefender && flowManager) {
      flowManager.add(
        new FrenzyOperation(this, attacker.id, defender.id, null, true)
      );
      return;
    }

    // No square was vacated, so no follow-up prompt will complete the Block.
    flowManager?.context.gameService.finishBlockActivation(attacker.id);
  }

  /**
   * Ball & Chain into a Prone or Stunned player: "that player is Pushed Back
   * and an Armour Roll is made against them". The push uses the normal
   * engine, chain pushes included, but it is not a Block Action, so the
   * pushed player's own push reactions do not apply. FinishBallAndChainSquare
   * makes the Armour Roll once the push has landed.
   */
  public async startBallAndChainPush(
    attackerId: string,
    pushedId: string
  ): Promise<void> {
    const attacker = this.getPlayerById(attackerId);
    const pushed = this.getPlayerById(pushedId);
    if (!attacker?.gridPosition || !pushed?.gridPosition) return;
    this.chain = {
      attackerId,
      resultType: "push",
      knockDownDefender: false,
      forceFollowUp: true,
      links: [],
    };
    this.requestPushDecision(this.chain, attacker.gridPosition, pushed);
  }

  private requestPushDecision(
    chain: PushChain,
    pusherPos: Square,
    pushed: Player
  ): void {
    const isOccupied = (x: number, y: number) =>
      this.getPlayerAt(x, y) !== undefined;

    // Grab (first push only) / Sidestep (any link): any unoccupied square
    // adjacent to the pushed player — Grab hands the choice to the blocker,
    // Sidestep to the PUSHED player's coach. Both fall back to the normal
    // push if the target is fully boxed in (the skill "cannot be used").
    const grabApplies = !!chain.grabPush && chain.links.length === 0;
    const anyAdjacent =
      grabApplies || chain.sideStepPush
        ? this.blockResolutionService.getGrabPushOptions(
            pushed.gridPosition!,
            isOccupied
          )
        : [];

    const { options, tier } =
      anyAdjacent.length > 0
        ? { options: anyAdjacent, tier: "open" as const }
        : this.blockResolutionService.getPushOptions(
            pusherPos,
            pushed.gridPosition!,
            isOccupied
          );

    const sideStepApplies = !!chain.sideStepPush && anyAdjacent.length > 0;
    const attacker = this.getPlayerById(chain.attackerId);

    // The wider Grab/Sidestep square set is what's in play for THIS push
    // decision — name the skill in the match log so a square outside the
    // usual three doesn't look arbitrary (rulebook p.135).
    if (anyAdjacent.length > 0) {
      this.announceOpenPush(sideStepApplies ? pushed : attacker, {
        sideStep: sideStepApplies,
      });
    }

    this.eventBus.emit(GameEventNames.UI_SelectPushDirection, {
      defenderId: pushed.id,
      validDirections: options,
      canFollowUp:
        this.blockResolutionService.allowsFollowUp(chain.resultType) &&
        !chain.preventFollowUp,
      resultType: chain.resultType,
      attackerId: chain.attackerId,
      // The blocker's coach chooses — except a Sidestep push, which the
      // pushed player's coach places
      chooserTeamId: sideStepApplies ? pushed.teamId : attacker?.teamId,
      pushTier: tier,
    });
  }

  /** Names Grab or Sidestep when it opens every adjacent square to a push. */
  private announceOpenPush(
    holder: Player | undefined,
    { sideStep }: { sideStep: boolean }
  ): void {
    if (!holder) return;
    const skill = sideStep ? SkillType.SIDESTEP : SkillType.GRAB;
    this.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: holder.id,
      skill,
      effect: `${skill}: this push is offered among all open adjacent squares, not just the usual three`,
    });
  }

  /**
   * Record the chosen push direction for the currently awaited player.
   * Occupied target: the occupant is pushed onward (chain, rulebook p.55).
   * Off-pitch target: pushed into the crowd. Otherwise the chain is
   * complete and all links apply, innermost first.
   */
  public async executePush(
    attackerId: string,
    defenderId: string,
    direction: Square,
    resultType: string,
    followUp: boolean
  ): Promise<void> {
    const defender = this.getPlayerById(defenderId);
    if (!defender || !defender.gridPosition) return;

    if (!this.chain) {
      // Direct call without resolveBlock (tests/tools): start a chain now
      this.chain = {
        attackerId,
        resultType: resultType as BlockResultType,
        knockDownDefender: isPow(resultType),
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
      await this.applyChain(followUp);
      return;
    }

    this.chain.links.push({ playerId: defenderId, from, to: direction });

    const occupant = this.getPlayerAt(direction.x, direction.y);
    if (occupant && occupant.id !== defenderId) {
      // Chain push: the occupant is pushed as if by the incoming player;
      // the blocking coach keeps choosing directions. The occupant's own
      // push reactions apply: Stand Firm "including during a Chain Push"
      // (p.136) and Sidestep "for any reason" (p.135).
      const reaction = await this.foldChainPush(occupant);
      if (!this.chain) return;
      if (reaction.refused) {
        await this.refuseChain();
        return;
      }
      this.chain.sideStepPush = reaction.sideStepPush;
      this.requestPushDecision(this.chain, from, occupant);
      return;
    }

    await this.applyChain(followUp);
  }

  /**
   * Fold the chain-pushed player's own push reactions. Only their rules run:
   * the blocker's (Grab, Strip Ball, Eye Gouge) act on the Block's target,
   * and Taunt reacts to a Block "performed against them".
   */
  private async foldChainPush(
    pushed: Player
  ): Promise<Pick<PushContext, "refused" | "sideStepPush">> {
    const chain = this.chain!;
    const attacker = this.getPlayerById(chain.attackerId)!;
    const ctx: PushContext = {
      attacker,
      pushed,
      resultType: chain.resultType,
      isBlitz: this.isBlitzBlock(attacker),
      pushedHasBall: this.isOnBall(pushed),
      blockerIgnoresReactions: !!chain.blockerIgnoresReactions,
      chainPush: true,
      refused: false,
      preventFollowUp: false,
      stripBall: false,
      eyeGouge: false,
      grabPush: false,
      sideStepPush: false,
      forceFollowUp: false,
      decisions: this.decisions(),
      flow: this.callbacks.getFlowManager?.(),
      triggers: [],
    };
    await foldTrigger("onPush", [pushed], ctx);
    this.announce(ctx.triggers);
    return ctx;
  }

  /**
   * A chain-pushed player stood firm: the player pushed into them cannot
   * move, so nobody in the chain moves. The Block's target is treated as
   * having refused the push itself (a POW still knocks them down in place).
   */
  private async refuseChain(): Promise<void> {
    const chain = this.chain!;
    this.chain = null;
    const attacker = this.getPlayerById(chain.attackerId);
    const defender = this.getPlayerById(chain.links[0].playerId);
    if (!attacker || !defender) return;
    await this.resolveRefusedPush(
      attacker,
      defender,
      chain.knockDownDefender ?? isPow(chain.resultType),
      !!chain.frenzy
    );
  }

  /** Apply all chain links innermost-first, then knockdown/follow-up. */
  private async applyChain(followUp: boolean): Promise<void> {
    const chain = this.chain;
    if (!chain) return;
    this.chain = null;
    const knockDownDefender =
      chain.knockDownDefender ?? isPow(chain.resultType);

    const target = this.getPlayerById(chain.links[0]?.playerId ?? "");
    if (chain.eyeGouge && target) this.eyeGouge(chain.attackerId, target);

    const landing = this.landLinks(chain, { knockDownDefender, followUp });

    // Knockdown applies only to the original defender on POW results
    const first = chain.links[0];
    if (!first) return;
    if (first.to === null) {
      this.followUpCrowdSurf(chain.attackerId, first.from);
      return;
    }
    // Steady Footing is the only wait. It comes before the original target's
    // knockdown and the Frenzy continuation are queued (landLinks may already
    // have queued a loose-ball Bounce or a crowd or trapdoor injury): the
    // knockdown's InOrderOperation must start in the same run that queues
    // Frenzy behind it, or Frenzy's follow-up overtakes the dropped ball.
    const defender =
      knockDownDefender && !landing.fellThrough.has(first.playerId)
        ? this.getPlayerById(first.playerId)
        : undefined;
    const saved =
      !!defender &&
      (await steadyFootingSaves(
        defender,
        this.diceController,
        this.eventBus,
        this.callbacks.getFlowManager?.()?.context.gameService
      ));
    this.settlePushedTarget(chain, first, first.to, {
      defender,
      saved,
      knockDownDefender,
      landing,
    });
  }

  /** Eye Gouge: only the Block's target, and only now it is Pushed Back. */
  private eyeGouge(attackerId: string, target: Player): void {
    addCondition(target, PlayerCondition.EYE_GOUGED);
    this.announce([
      {
        playerId: attackerId,
        skill: SkillType.EYE_GOUGE,
        effect: `Eye Gouge: ${target.playerName} cannot assist until next activated`,
      },
    ]);
  }

  /** Moves every pushed player, innermost link first. */
  private landLinks(
    chain: PushChain,
    {
      knockDownDefender,
      followUp,
    }: { knockDownDefender: boolean; followUp: boolean }
  ): ChainLanding {
    const landing: ChainLanding = {
      fellThrough: new Set(),
      landedOnLooseBall: new Set(),
    };
    const offersFollowUp =
      !followUp && !chain.preventFollowUp && !chain.forceFollowUp;
    for (let i = chain.links.length - 1; i >= 0; i--) {
      const link = chain.links[i];
      const player = this.getPlayerById(link.playerId);
      if (!player) continue;
      const isOriginalDefender = i === 0;
      this.landLink(link, player, landing, {
        falls: isOriginalDefender && knockDownDefender,
        followUpData:
          isOriginalDefender && offersFollowUp
            ? { attackerId: chain.attackerId, targetSquare: link.from }
            : undefined,
      });
    }
    return landing;
  }

  /** Moves one pushed player to the square they were pushed into. */
  private landLink(
    link: PushLink,
    player: Player,
    landing: ChainLanding,
    {
      falls,
      followUpData,
    }: {
      /** The Block's target, going down once the chain has moved. */
      falls: boolean;
      followUpData: { attackerId: string; targetSquare: Square } | undefined;
    }
  ): void {
    if (link.to === null) {
      this.pushIntoCrowd(player, link.from);
      return;
    }
    const to = link.to;
    const flowManager = this.callbacks.getFlowManager?.();
    player.gridPosition = { ...to };
    const carriedBall = this.carryBall(link.from, to);

    // Pushed onto a loose ball: it bounces, and a pushed player cannot
    // score with it. A fallen defender's bounce is queued with the
    // knockdown, or there too if Steady Footing keeps them up.
    const onLooseBall = !carriedBall && this.ballAt(to);
    if (onLooseBall) landing.landedOnLooseBall.add(link.playerId);
    if (onLooseBall && !falls) {
      flowManager?.add(new BounceOperation(to), true);
    }
    this.eventBus.emit(GameEventNames.PlayerMoved, {
      playerId: link.playerId,
      from: link.from,
      to,
      path: [link.from, to],
      ballFrom: carriedBall ? link.from : undefined,
      ballPath: carriedBall ? [link.from, to] : undefined,
      ballJoinStep: 0,
      followUpData,
    });

    if (
      this.fallThroughTrapdoor(player, to, {
        carriedBall,
        // The fallen defender's deferred bounce would be skipped.
        bounceLooseBall: onLooseBall && falls,
      })
    ) {
      landing.fellThrough.add(link.playerId);
      return;
    }

    // A standing carrier pushed into their scoring end zone still scores
    // (the original defender falls on POW, so no score for them)
    if (!falls && !onLooseBall) {
      flowManager?.context.gameService.checkForTouchdown(link.playerId);
    }
  }

  /**
   * Crowd surf: off the pitch; injury without armour, ball throw-in and
   * turnover handled by the operation.
   */
  private pushIntoCrowd(player: Player, exitSquare: Square): void {
    player.gridPosition = undefined;
    this.eventBus.emit(GameEventNames.PlayerPushedIntoCrowd, {
      playerId: player.id,
      exitSquare,
    });
    this.queueCrowdInjury(player, exitSquare);
  }

  /** A pushed player keeps hold of the ball. Returns whether they had it. */
  private carryBall(from: Square, to: Square): boolean {
    if (!this.ballAt(from)) return false;
    this.state.ballPosition = { ...to };
    this.eventBus.emit(GameEventNames.BallPlaced, { ...to });
    return true;
  }

  /**
   * Pushed onto a Trapdoor: fall through it, injured as if Pushed into
   * the Crowd, a carried ball Bouncing from the Trapdoor. Returns whether
   * the Trapdoor opened.
   */
  private fallThroughTrapdoor(
    player: Player,
    square: Square,
    {
      carriedBall,
      bounceLooseBall,
    }: { carriedBall: boolean; bounceLooseBall: boolean }
  ): boolean {
    if (!trapdoorOpens(this.state, this.diceController, player, square)) {
      return false;
    }
    player.gridPosition = undefined;
    if (bounceLooseBall) {
      this.callbacks.getFlowManager?.()?.add(new BounceOperation(square), true);
    }
    this.queueCrowdInjury(player, square, { carriedBall });
    return true;
  }

  /**
   * Injury for a player who left the pitch. Whether it's a turnover is
   * decided NOW — by the time the operation runs the turn may have ended
   * (auto end-turn on the blocker's last activation)
   */
  private queueCrowdInjury(
    player: Player,
    square: Square,
    trapdoor?: { carriedBall: boolean }
  ): void {
    const flowManager = this.callbacks.getFlowManager?.();
    if (!flowManager) return;
    const isTurnover =
      player.teamId === flowManager.context.gameService.getActiveTeamId();
    flowManager.add(
      new CrowdInjuryOperation(player.id, square, isTurnover, trapdoor),
      true
    );
  }

  /**
   * The pushed target goes down where they landed on a POW, or drops the
   * ball to Strip Ball, then the follow-up.
   */
  private settlePushedTarget(
    chain: PushChain,
    first: PushLink,
    to: Square,
    {
      defender,
      saved,
      knockDownDefender,
      landing,
    }: {
      /** The target, when a POW knocks them down and they are still here. */
      defender: Player | undefined;
      /** Steady Footing kept them up. */
      saved: boolean;
      knockDownDefender: boolean;
      landing: ChainLanding;
    }
  ): void {
    if (defender) this.landPushedTarget(chain, defender, to, saved, landing);
    const standing = !knockDownDefender || saved;

    // Strip Ball: a still-standing carrier who was Pushed Back drops the ball
    // where they land, which then bounces (a POW carrier drops it above).
    if (
      chain.stripBall &&
      standing &&
      !landing.fellThrough.has(first.playerId) &&
      this.ballAt(to)
    ) {
      this.callbacks.getFlowManager?.()?.add(new BounceOperation(to), true);
    }
    this.endPushedBlock(chain, first, standing);
  }

  /**
   * The POW'd target where they landed: knocked down there, or kept up by
   * Steady Footing, when the ball they landed on Bounces or they may score.
   */
  private landPushedTarget(
    chain: PushChain,
    defender: Player,
    to: Square,
    saved: boolean,
    landing: ChainLanding
  ): void {
    if (!saved) {
      this.knockDownOnSquare(chain.attackerId, defender, to);
      return;
    }
    const flowManager = this.callbacks.getFlowManager?.();
    if (landing.landedOnLooseBall.has(defender.id))
      flowManager?.add(new BounceOperation(to), true);
    else if (!chain.stripBall)
      flowManager?.context.gameService.checkForTouchdown(defender.id);
  }

  /**
   * Knock the Block's target down on the square they ended on: the Armour
   * Roll, then a carried ball Bounces from there (p.44). Pile Driver may
   * Foul them once the Block resolves.
   */
  private knockDownOnSquare(
    attackerId: string,
    defender: Player,
    square: Square | undefined
  ): void {
    this.knockDownTarget(defender);
    const attacker = this.getPlayerById(attackerId);
    if (attacker && hasSkill(attacker.skills, SkillType.PILE_DRIVER)) {
      this.pileDriverTargets.set(attackerId, defender.id);
    }
    const bounce =
      square && this.ballAt(square) ? [new BounceOperation(square)] : [];
    this.callbacks
      .getFlowManager?.()
      ?.add(
        new InOrderOperation([
          new ArmourOperation(defender.id, attackerId),
          ...bounce,
        ]),
        true
      );
  }
}

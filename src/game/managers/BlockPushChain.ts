import { type BallId, ballAt, placeBall } from "../rules/balls";
import {
  type Player,
  PlayerCondition,
  addCondition,
  hasCondition,
} from "@/types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { type BlockResultType } from "../../services/BlockResolutionService";
import { GameEventNames } from "../../types/events";
import { ArmourOperation } from "../operations/ArmourOperation.js";
import { BounceOperation } from "../operations/BounceOperation";
import { type CrowdFall, CrowdInjuryOperation } from "../operations/CrowdInjuryOperation";
import { trapdoorOpens } from "../inducements/matchInducements";
import { barricadeBetween, pushLandingAt } from "../rules/pitchSquares";
import { activeRules } from "../variants/activeMatch";
import { type PushContext, foldTrigger } from "../skills";
import { steadyFootingSaves } from "../rules/steadyFooting";
import {
  FinishBlockOperation,
  FrenzyOperation,
  InOrderOperation,
} from "./BlockOperations";
import { BlockActivation } from "./BlockActivation";

interface Square {
  x: number;
  y: number;
}

interface PushLink {
  playerId: string;
  from: Square;
  to: Square | null;
  pit?: Square;
}

interface PushChain {
  attackerId: string;
  resultType: BlockResultType;

  knockDownDefender?: boolean;

  preventFollowUp?: boolean;

  stripBall?: boolean;

  eyeGouge?: boolean;

  grabPush?: boolean;

  sideStepPush?: boolean;

  blockerIgnoresReactions?: boolean;

  forceFollowUp?: boolean;

  frenzy?: boolean;
  links: PushLink[];
}

interface ChainLanding {
  pushedBy: string;
  fellThrough: Set<string>;
  landedOnLooseBall: Set<string>;
}

const SECOND_BALL: BallId = 1;

const isPow = (resultType: string): boolean =>
  resultType === "pow" || resultType === "pow-dodge";

export abstract class BlockPushChain extends BlockActivation {
  protected chain: PushChain | null = null;

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
      ...this.triggerServices(),
      triggers: [],
    };
    await foldTrigger(
      "onPush",
      this.blockParticipants(attacker, defender),
      pushCtx
    );
    this.announce(pushCtx.triggers);
    this.constrainPush(pushCtx);

    const frenzyFollowUp =
      hasSkill(attacker.skills, SkillType.FRENZY) &&
      this.multipleBlockState?.attackerId !== attacker.id &&
      !pushCtx.preventFollowUp;
    const frenzy = frenzyFollowUp && this.frenzyExtraFor !== attacker.id;
    if (frenzyFollowUp) {
      pushCtx.forceFollowUp = true;
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

  private constrainPush(pushCtx: PushContext): void {
    const { attacker, pushed: defender } = pushCtx;

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

    if (hasCondition(attacker, PlayerCondition.ROOTED)) {
      pushCtx.preventFollowUp = true;
    }
    if (this.multipleBlockState?.attackerId === attacker.id) {
      pushCtx.preventFollowUp = true;
      pushCtx.forceFollowUp = false;
    }

    if (!this.isBallAndChain(attacker)) {
      return;
    }

    pushCtx.preventFollowUp = false;
    pushCtx.forceFollowUp = true;
  }

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

    flowManager?.add(new FinishBlockOperation(attacker.id));
  }

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

    if (anyAdjacent.length > 0) {
      this.announceOpenPush(sideStepApplies ? pushed : attacker, {
        sideStep: sideStepApplies,
      });
    }

    const chooserTeamId = sideStepApplies ? pushed.teamId : attacker?.teamId;
    this.eventBus.emit(GameEventNames.UI_SelectPushDirection, {
      defenderId: pushed.id,
      validDirections: options,
      canFollowUp:
        this.blockResolutionService.allowsFollowUp(chain.resultType) &&
        !chain.preventFollowUp,
      resultType: chain.resultType,
      attackerId: chain.attackerId,
      ...(chooserTeamId !== undefined && { chooserTeamId }),
      pushTier: tier,
    });
  }

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

  public async executePush(
    attackerId: string,
    defenderId: string,
    direction: Square,
    resultType: string,
    followUp: boolean
  ): Promise<void> {
    const defender = this.getPlayerById(defenderId);
    if (!defender?.gridPosition) return;

    if (!this.chain) {
      this.chain = {
        attackerId,
        resultType: resultType as BlockResultType,
        knockDownDefender: isPow(resultType),
        links: [],
      };
    }

    const from = { ...defender.gridPosition };
    if (pushLandingAt(from, direction) !== "pitch") {
      await this.pushOffThePitch(this.chain, defender, {
        from,
        direction,
        followUp,
      });
      return;
    }

    this.chain.links.push({ playerId: defenderId, from, to: direction });

    const occupant = this.getPlayerAt(direction.x, direction.y);
    if (occupant && occupant.id !== defenderId) {
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
      ...this.triggerServices(),
      triggers: [],
    };
    await foldTrigger("onPush", [pushed], ctx);
    this.announce(ctx.triggers);
    return ctx;
  }

  private async refuseChain(): Promise<void> {
    const chain = this.chain!;
    this.chain = null;
    const attacker = this.getPlayerById(chain.attackerId);
    const defender = this.getPlayerById(chain.links[0]?.playerId ?? "");
    if (!attacker || !defender) return;
    await this.resolveRefusedPush(
      attacker,
      defender,
      chain.knockDownDefender ?? isPow(chain.resultType),
      !!chain.frenzy
    );
  }

  private async applyChain(followUp: boolean): Promise<void> {
    const chain = this.chain;
    if (!chain) return;
    this.chain = null;
    const knockDownDefender =
      chain.knockDownDefender ?? isPow(chain.resultType);

    const target = this.getPlayerById(chain.links[0]?.playerId ?? "");
    if (chain.eyeGouge && target) this.eyeGouge(chain.attackerId, target);

    const landing = this.landLinks(chain, { knockDownDefender, followUp });

    const first = chain.links[0];
    if (!first) return;
    if (first.to === null) {
      this.followUpCrowdSurf(chain.attackerId, first.from);
      return;
    }

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

  private landLinks(
    chain: PushChain,
    {
      knockDownDefender,
      followUp,
    }: { knockDownDefender: boolean; followUp: boolean }
  ): ChainLanding {
    const landing: ChainLanding = {
      pushedBy: chain.attackerId,
      fellThrough: new Set(),
      landedOnLooseBall: new Set(),
    };
    const offersFollowUp =
      !followUp && !chain.preventFollowUp && !chain.forceFollowUp;
    for (let i = chain.links.length - 1; i >= 0; i--) {
      const link = chain.links[i];
      const player = link && this.getPlayerById(link.playerId);
      if (!link || !player) continue;
      const isOriginalDefender = i === 0;
      this.landLink(link, player, landing, {
        falls: isOriginalDefender && knockDownDefender,
        ...(isOriginalDefender && offersFollowUp && {
              followUpData: {
                attackerId: chain.attackerId,
                targetSquare: link.from,
              },
            }),
      });
    }
    return landing;
  }

  private landLink(
    link: PushLink,
    player: Player,
    landing: ChainLanding,
    {
      falls,
      followUpData,
    }: {
      falls: boolean;
      followUpData?: { attackerId: string; targetSquare: Square };
    }
  ): void {
    if (link.to === null) {
      this.leaveThePitch(link, player, landing.pushedBy);
      return;
    }
    const to = link.to;
    const flowManager = this.callbacks.getFlowManager?.();
    player.gridPosition = { ...to };
    const resting = ballAt(this.state, to);
    const carriedBall = this.carryBall(link.from, to);

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
      ...(carriedBall && { ballFrom: link.from, ballPath: [link.from, to] }),
      ballJoinStep: 0,
      ...(followUpData && { followUpData }),
    });

    if (
      this.fallThroughTrapdoor(player, to, {
        carriedBall,

        bounceLooseBall: onLooseBall && falls,
      })
    ) {
      landing.fellThrough.add(link.playerId);
      return;
    }
    if (carriedBall) this.bounceStrayBall(to, { resting, falls });

    if (!falls && !onLooseBall) {
      flowManager?.context.gameService.checkForTouchdown(link.playerId);
    }
  }

  private bounceStrayBall(
    to: Square,
    { resting, falls }: { resting: BallId | undefined; falls: boolean }
  ): void {
    if (resting === undefined) return;
    this.flow()?.add(
      new BounceOperation(to, { ball: falls ? SECOND_BALL : resting }),
      true
    );
  }

  private pushIntoCrowd(player: Player, exitSquare: Square, pushedBy: string): void {
    delete player.gridPosition;
    this.eventBus.emit(GameEventNames.PlayerPushedIntoCrowd, {
      playerId: player.id,
      exitSquare,
    });
    this.queueCrowdInjury(player, exitSquare, { pushedBy });
  }

  private async pushOffThePitch(
    chain: PushChain,
    pushed: Player,
    {
      from,
      direction,
      followUp,
    }: { from: Square; direction: Square; followUp: boolean }
  ): Promise<void> {
    const landing = pushLandingAt(from, direction);
    if (landing === "wall") {
      await this.pushIntoWall(chain, pushed, { square: from, wall: direction });
      return;
    }
    chain.links.push({
      playerId: pushed.id,
      from,
      to: null,
      ...((landing === "pit") && { pit: { ...direction } }),
    });
    await this.applyChain(followUp);
  }

  private leaveThePitch(link: PushLink, player: Player, pushedBy: string): void {
    if (link.pit) this.dropIntoPit(player, link.from, link.pit);
    else this.pushIntoCrowd(player, link.from, pushedBy);
  }

  private dropIntoPit(player: Player, from: Square, pit: Square): void {
    const carriedBall = ballAt(this.state, from);
    delete player.gridPosition;
    player.sewerPit = { ...pit };
    this.eventBus.emit(GameEventNames.PlayerFellIntoPit, {
      playerId: player.id,
      from,
      pit: { ...pit },
    });
    this.eventBus.emit(GameEventNames.PlayerStatusChanged, player);
    if (carriedBall !== undefined) {
      placeBall(this.state, carriedBall, pit);
      this.flow()?.add(new BounceOperation(pit, { ball: carriedBall }), true);
    }
    if (player.teamId === this.state.activeTeamId)
      this.callbacks.onTurnover("Fell into a Sewer Pit");
  }

  private async pushIntoWall(
    chain: PushChain,
    pushed: Player,
    at: { square: Square; wall: Square }
  ): Promise<void> {
    this.chain = null;
    const attacker = this.getPlayerById(chain.attackerId);
    const defender = this.getPlayerById(chain.links[0]?.playerId ?? pushed.id);
    if (!attacker || !defender) return;
    const pow = chain.knockDownDefender ?? isPow(chain.resultType);
    const isDefender = pushed.id === defender.id;
    const fell = this.hitTheWall(pushed, at, pow && isDefender);
    if (fell)
      this.knockDownAgainstWall(chain.attackerId, pushed, pow && isDefender);
    if (pow && isDefender) {
      this.flow()?.add(new FinishBlockOperation(attacker.id));
      return;
    }
    const frenzy = !!chain.frenzy && !(fell && isDefender);
    await this.resolveRefusedPush(attacker, defender, pow, frenzy);
  }

  private hitTheWall(
    pushed: Player,
    { square, wall }: { square: Square; wall: Square },
    knockedDown: boolean
  ): boolean {
    const fell =
      knockedDown ||
      this.diceController.rollD6(
        barricadeBetween(square, wall)
          ? "Pushed into the Barricade"
          : "Pushed into the Wall"
      ) >= 4;
    this.eventBus.emit(GameEventNames.PlayerPushedIntoWall, {
      playerId: pushed.id,
      square: { ...square },
      wall: { ...wall },
      fell,
    });
    return fell;
  }

  private flow() {
    return this.callbacks.getFlowManager?.();
  }

  private knockDownAgainstWall(
    attackerId: string,
    player: Player,
    knockedDown: boolean
  ): void {
    this.knockDownTarget(player);
    const square = player.gridPosition;
    const bounce =
      square && this.ballAt(square) ? [new BounceOperation(square)] : [];
    const modifier = knockedDown ? activeRules().armour.wallPush : 0;
    this.flow()?.add(
      new InOrderOperation([
        new ArmourOperation(
          player.id,
          attackerId,
          undefined,
          "block",
          modifier
        ),
        ...bounce,
      ]),
      true
    );
  }

  private carryBall(from: Square, to: Square): boolean {
    const ball = ballAt(this.state, from);
    if (ball === undefined) return false;
    placeBall(this.state, ball, to);
    this.eventBus.emit(GameEventNames.BallPlaced, { ...to });
    return true;
  }

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
    delete player.gridPosition;
    if (bounceLooseBall) {
      this.callbacks.getFlowManager?.()?.add(new BounceOperation(square), true);
    }
    this.queueCrowdInjury(player, square, { trapdoor: { carriedBall } });
    return true;
  }

  private queueCrowdInjury(
    player: Player,
    square: Square,
    fall: Omit<CrowdFall, "isTurnover">
  ): void {
    const flowManager = this.callbacks.getFlowManager?.();
    if (!flowManager) return;
    const isTurnover =
      player.teamId === flowManager.context.gameService.getActiveTeamId();
    flowManager.add(
      new CrowdInjuryOperation(player.id, square, { ...fall, isTurnover }),
      true
    );
  }

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
      defender: Player | undefined;

      saved: boolean;
      knockDownDefender: boolean;
      landing: ChainLanding;
    }
  ): void {
    if (defender) this.landPushedTarget(chain, defender, to, saved, landing);
    const standing = !knockDownDefender || saved;

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

import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { SkillType, hasSkill } from "../../types/Skills";
import { IGameService } from "../../services/interfaces/IGameService";
import { InterceptionDecisionAnswer } from "../../types/decisions";
import { PlayerStatus, hasTackleZone } from "../../types/Player";
import { BounceOperation } from "./BounceOperation";
import { CatchOperation } from "./CatchOperation";
import { ArmourOperation } from "./ArmourOperation";
import {
  foldTrigger,
  gatherParticipants,
  adjacentStanding,
  playersWithin,
  PassDeclaredContext,
  PassResultContext,
  withRerollOffer,
} from "../skills";

/**
 * Ends the passer's activation once a Pass / Hand-off (and its catch/bounce)
 * has settled — a Pass Action ends the activation. Give and Go skips this after
 * a Quick Pass or a Hand-off (so long as no Turnover was caused), letting the
 * player continue their Move with any movement remaining. A turnover is latched
 * before the ball-settling flow goes idle, so this operation can suppress Give
 * and Go even before the delayed turn change occurs.
 */
class FinishPassActivationOperation extends GameOperation {
  public readonly name = "FinishPassActivation";

  constructor(
    private passerId: string,
    private giveAndGoExempt: boolean
  ) {
    super();
  }

  async execute(context: any): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus =
      context.eventBus as import("../../services/EventBus").IEventBus;
    if (gameService.isTurnoverInProgress()) {
      // The visual turnover delay must not leave a command window in which
      // the passer can keep moving before the next turn starts.
      gameService.finishActivation(this.passerId);
      return;
    }
    if (gameService.getState().activePlayer?.id !== this.passerId) return;
    if (this.giveAndGoExempt) {
      const passer = gameService.getPlayerById(this.passerId);
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: this.passerId,
        skill: SkillType.GIVE_AND_GO,
        effect: `Give and Go: ${passer?.playerName ?? "the player"} may continue moving`,
      });
      return;
    }
    gameService.finishActivation(this.passerId);
  }
}

/**
 * PassOperation
 *
 * Responsibility:
 * - Execute the "Pass" sequence:
 *   1. Calculate modifiers (using Controller)
 *   2. Roll accuracy
 *   3. Animate ball flight (via events)
 *   4. Determine landing spot (or scatter)
 *   5. Trigger next operation (Catch or Bounce)
 */
export class PassOperation extends GameOperation {
  public readonly name = "PassOperation";

  constructor(
    private passerId: string,
    private targetX: number,
    private targetY: number
  ) {
    super();
  }

  async execute(context: any): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus =
      context.eventBus as import("../../services/EventBus").IEventBus;

    const passer = gameService.getPlayerById(this.passerId);
    if (!passer || !passer.gridPosition) return;

    console.log(
      `[PassOperation] Executing pass from ${passer.id} to ${this.targetX},${this.targetY}`
    );

    // 1. Calculate Result (Logic delegated to Controller)
    // We assume PassController is pure calculation helper now
    const passController = gameService.getPassController();
    const catchController = gameService.getCatchController();

    const opponents = gameService.getOpponents(passer.teamId); // Helper needed on service?
    // Calculate marking opponents (Zones of Control)
    const markingOpponents = catchController.countMarkingOpponents(
      passer.gridPosition,
      opponents
    );

    // Trigger point: pass declared — rules adjust the PA test (Accurate,
    // Cannoneer by range; Nerves of Steel cancels marking)
    const passRange = passController.measureRange(passer.gridPosition, {
      x: this.targetX,
      y: this.targetY,
    });
    const targetPlayer = gameService
      .getTeammates(this.passerId)
      .find(
        (p) =>
          p.gridPosition?.x === this.targetX &&
          p.gridPosition?.y === this.targetY
      );

    // On the Ball resolves after the target is known but before any modifier
    // folds or the Passing Ability Test. Reactors move one at a time; a fall
    // stops the remaining reactions but is not a Turnover (it is not their
    // team turn).
    await this.resolveOnTheBall(gameService, eventBus, context, passer, {
      x: this.targetX,
      y: this.targetY,
    });

    const passCtx: PassDeclaredContext = {
      player: passer,
      passType: passRange.type,
      targetPlayer,
      marking: markingOpponents,
      modifiers: 0,
      decisions: gameService.getDecisionService(),
      flow: context.flowManager,
      arbiter: gameService.getRerollArbiter(),
      dice: gameService.getDiceController(),
      triggers: [],
    };
    await foldTrigger(
      "onPassDeclared",
      gatherParticipants(passer, undefined, [
        ...adjacentStanding(passer.gridPosition, opponents),
        // Aura skills (Disturbing Presence) reach 3 squares, any status
        ...playersWithin(passer.gridPosition, opponents, 3),
      ]),
      passCtx
    );
    passCtx.triggers.forEach((t) =>
      eventBus.emit(GameEventNames.SkillTriggered, t)
    );

    // Animosity: the thrower refuses — the activation ends, the ball
    // stays put, no turnover
    if (passCtx.refused) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${passer.playerName} refuses to throw to that team-mate!`
      );
      gameService.finishActivation(this.passerId);
      return;
    }

    const result = await passController.attemptPass(
      passer,
      passer.gridPosition,
      { x: this.targetX, y: this.targetY },
      markingOpponents,
      { gameService, eventBus }, // failed passes may offer a reroll
      passCtx.modifiers,
      passCtx.downgradeAccurate // Hail Mary: Accurate → Inaccurate
    );

    // Trigger point: PA test rolled — Safe Pass may cancel a natural-1
    // fumble (keep the ball, end the activation, no turnover)
    const resultCtx: PassResultContext = {
      player: passer,
      roll: result.roll,
      fumbled: result.fumbled,
      accurate: result.accurate,
      decisions: gameService.getDecisionService(),
      flow: context.flowManager,
      arbiter: gameService.getRerollArbiter(),
      triggers: [],
    };
    await foldTrigger("onPassResult", [passer], resultCtx);
    resultCtx.triggers.forEach((t) =>
      eventBus.emit(GameEventNames.SkillTriggered, t)
    );

    // 2. Emit Animation Events
    eventBus.emit(GameEventNames.PassAttempted, {
      playerId: this.passerId,
      from: passer.gridPosition,
      to: { x: this.targetX, y: this.targetY },
      passType: result.passType,
      accurate: !result.fumbled && result.success, // Simplified
      finalPosition: result.finalPosition,
      scatterPath: result.scatterPath,
    });

    // 3. Wait for Animation (Simulated)
    // Ideally we listen for "BallAnimationComplete" or just wait fixed time
    await context.delay(1500);

    // 4. Handle Outcome
    const declaredAction = gameService.getState().activePlayer?.action;
    if (result.fumbled && resultCtx.keepBall) {
      // Safe Pass: no fumble — the passer retains possession, their
      // activation ends, no turnover
      eventBus.emit(GameEventNames.UI_Notification, "Safe Pass! Ball held.");
      if (passer.gridPosition) {
        gameService.setBallPosition(
          passer.gridPosition.x,
          passer.gridPosition.y
        );
      }
      gameService.finishActivation(this.passerId);
      return;
    }
    if (result.fumbled) {
      eventBus.emit(GameEventNames.UI_Notification, "FUMBLE!");
      // Fumbled = Drops in passer's square, then bounces
      // Update ball pos to passer first
      if (passer.gridPosition) {
        gameService.setBallPosition(
          passer.gridPosition.x,
          passer.gridPosition.y
        );
        context.flowManager.add(new BounceOperation(passer.gridPosition), true);
      }
      gameService.triggerTurnover("Fumbled Pass");
    } else {
      // Pass flew somewhere (Accurate OR Inaccurate)
      // Pass logic already determined 'finalPosition' (target or scattered)
      const landingPos = result.finalPosition;

      // The defending team may Intercept the ball in flight, before it
      // resolves at its landing square. A successful interception grants
      // possession and a turnover — the catch/bounce below is skipped. Hail
      // Mary Pass suppresses interception outright; Cloud Burster suppresses it
      // for everyone except a Very Long Legs interceptor.
      const intercepted =
        !passCtx.suppressInterception &&
        (await this.resolveInterception(
          gameService,
          eventBus,
          passer,
          landingPos,
          result.accurate,
          passCtx.cloudBurster ?? false
        ));
      if (intercepted) return;

      if (result.success) {
        eventBus.emit(GameEventNames.UI_Notification, "Accurate Pass!");
      } else {
        eventBus.emit(GameEventNames.UI_Notification, "Inaccurate Pass!");
        // If inaccurate, it counts as a turnover?
        // Rule: "If the pass was not accurate... turnover unless caught by a teammate"
        // Turnover logic should probably wait until the ball settles?
        // Actually, "A failed Pass is a Turnover... unless the ball is caught by a player from the moving team"
        // So we trigger 'Pass Missed' turnover LATER if catch fails?
        // For now, let's let the recursive logic run. If it lands empty -> Turnover.
      }

      // Update ball position to landing spot
      (gameService as any).setBallPosition(landingPos.x, landingPos.y);

      // Check landing
      const playerAtLanding = gameService.getPlayerAt(
        landingPos.x,
        landingPos.y
      );

      if (playerAtLanding) {
        // Attempt Catch
        context.flowManager.add(
          new CatchOperation(
            playerAtLanding.id,
            true,
            {
              origin: declaredAction === "handoff" ? "handoff" : "pass",
              isPassTarget:
                declaredAction !== "handoff" &&
                landingPos.x === this.targetX &&
                landingPos.y === this.targetY,
            },
            {
              passerId: passer.id,
              passerTeamId: passer.teamId,
              accurate: result.accurate,
            }
          ),
          true
        );
      } else {
        const divingCatcher = [
          ...(gameService.getTeam(passer.teamId)?.players ?? []),
          ...opponents,
        ]
          .filter(
            (candidate) =>
              candidate.gridPosition &&
              candidate.status === PlayerStatus.ACTIVE &&
              hasSkill(candidate.skills, SkillType.DIVING_CATCH) &&
              Math.max(
                Math.abs(candidate.gridPosition.x - landingPos.x),
                Math.abs(candidate.gridPosition.y - landingPos.y)
              ) === 1
          )
          .sort(
            (a, b) =>
              a.gridPosition!.y - b.gridPosition!.y ||
              a.gridPosition!.x - b.gridPosition!.x
          )[0];

        if (divingCatcher) {
          context.flowManager.add(
            new CatchOperation(divingCatcher.id, true, {
              origin: declaredAction === "handoff" ? "handoff" : "pass",
              divingCatch: true,
              landingPosition: landingPos,
            }),
            true
          );
        } else {
          // Land in empty square -> Bounce
          eventBus.emit(
            GameEventNames.UI_Notification,
            "Ball Lands in Empty Square"
          );
          context.flowManager.add(new BounceOperation(landingPos), true);

          // If accurate pass lands empty -> Bounce -> Stop. Turnover?
          // "If the ball is not caught, it is a Turnover."
          gameService.triggerTurnover("Pass Incomplete");
        }
      }
    }

    // Update State
    gameService.getState().ballPosition = result.finalPosition;

    // A Pass Action ends the activation once it settles. Give and Go keeps it
    // open after a Quick Pass or a Hand-off. A latched Turnover bypasses it
    // even while the ball-settling flow is still completing.
    const giveAndGoExempt =
      hasSkill(passer.skills, SkillType.GIVE_AND_GO) &&
      (declaredAction === "handoff" || result.passType === "Quick Pass");
    context.flowManager.add(
      new FinishPassActivationOperation(this.passerId, giveAndGoExempt)
    );
  }

  private async resolveOnTheBall(
    gameService: IGameService,
    eventBus: import("../../services/EventBus").IEventBus,
    context: any,
    passer: import("../../types/Player").Player,
    target: { x: number; y: number }
  ): Promise<void> {
    const reactors = gameService
      .getOpponents(passer.teamId)
      .filter(
        (player) =>
          !!player.gridPosition &&
          player.status === PlayerStatus.ACTIVE &&
          hasSkill(player.skills, SkillType.ON_THE_BALL)
      )
      .sort(
        (a, b) =>
          a.gridPosition!.y - b.gridPosition!.y ||
          a.gridPosition!.x - b.gridPosition!.x
      );

    for (const reactor of reactors) {
      const answer = (await gameService.getDecisionService().request({
        type: "reaction",
        playerId: reactor.id,
        chooserTeamId: reactor.teamId,
        skill: SkillType.ON_THE_BALL,
        prompt: `${reactor.playerName} may move up to 3 squares before the pass — use On the Ball?`,
      })) as import("../../types/decisions").ReactionDecisionAnswer;
      if (!answer.accept || !reactor.gridPosition) continue;

      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: reactor.id,
        skill: SkillType.ON_THE_BALL,
        effect: "On the Ball: reacting move before the Passing Ability Test",
      });

      for (let stepNumber = 0; stepNumber < 3; stepNumber++) {
        const from = { ...reactor.gridPosition };
        const occupied = new Set<string>();
        for (const teamId of [passer.teamId, reactor.teamId]) {
          for (const player of gameService.getTeam(teamId)?.players ?? []) {
            if (player.id !== reactor.id && player.gridPosition) {
              occupied.add(`${player.gridPosition.x},${player.gridPosition.y}`);
            }
          }
        }
        const candidates: { x: number; y: number }[] = [];
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const square = { x: from.x + dx, y: from.y + dy };
            if (
              square.x >= 0 &&
              square.x < 26 &&
              square.y >= 0 &&
              square.y < 15 &&
              !occupied.has(`${square.x},${square.y}`)
            ) {
              candidates.push(square);
            }
          }
        }
        candidates.sort(
          (a, b) =>
            Math.max(Math.abs(a.x - target.x), Math.abs(a.y - target.y)) -
              Math.max(Math.abs(b.x - target.x), Math.abs(b.y - target.y)) ||
            a.y - b.y ||
            a.x - b.x
        );
        const to = candidates[0];
        if (!to) break;

        const opposition = gameService
          .getOpponents(reactor.teamId)
          .filter((player) => !!player.gridPosition && hasTackleZone(player));
        const leavesTackleZone = opposition.some(
          (marker) =>
            Math.max(
              Math.abs(marker.gridPosition!.x - from.x),
              Math.abs(marker.gridPosition!.y - from.y)
            ) === 1
        );
        if (leavesTackleZone) {
          const destinationMarkers = opposition.filter(
            (marker) =>
              Math.max(
                Math.abs(marker.gridPosition!.x - to.x),
                Math.abs(marker.gridPosition!.y - to.y)
              ) === 1
          ).length;
          const dodge = await withRerollOffer(
            { gameService, eventBus },
            reactor,
            "dodge",
            () =>
              gameService
                .getDiceController()
                .rollSkillCheck(
                  "Dodge",
                  reactor.stats.AG,
                  -destinationMarkers,
                  reactor.playerName
                )
          );
          if (!dodge.success) {
            reactor.gridPosition = { ...to };
            reactor.status = PlayerStatus.PRONE;
            eventBus.emit(GameEventNames.PlayerMoved, {
              playerId: reactor.id,
              from,
              to: { ...to },
              path: [from, { ...to }],
              ballJoinStep: 0,
            });
            eventBus.emit(GameEventNames.PlayerKnockedDown, {
              playerId: reactor.id,
            });
            eventBus.emit(GameEventNames.PlayerStatusChanged, reactor);
            context.flowManager.add(new ArmourOperation(reactor.id), true);
            return;
          }
        }

        reactor.gridPosition = { ...to };
        eventBus.emit(GameEventNames.PlayerMoved, {
          playerId: reactor.id,
          from,
          to: { ...to },
          path: [from, { ...to }],
          ballJoinStep: 0,
        });
      }
    }
  }

  /**
   * Offer the defending coach an interception of a pass in flight. Returns
   * true when the ball was intercepted (possession changed, turnover caused),
   * in which case the caller must NOT resolve the ball at its landing square.
   */
  private async resolveInterception(
    gameService: IGameService,
    eventBus: import("../../services/EventBus").IEventBus,
    passer: import("@/types/Player").Player,
    landing: { x: number; y: number },
    accurate: boolean,
    cloudBurster: boolean
  ): Promise<boolean> {
    if (!passer.gridPosition) return false;

    const passController = gameService.getPassController();
    const catchController = gameService.getCatchController();
    const opponents = gameService.getOpponents(passer.teamId);

    let eligible = passController.checkInterceptions(
      passer.gridPosition,
      landing,
      opponents,
      accurate
    );
    // Cloud Burster: only a Very Long Legs interceptor may still try.
    if (cloudBurster) {
      eligible = eligible.filter((e) => {
        const p = gameService.getPlayerById(e.playerId);
        return !!p && hasSkill(p.skills, SkillType.VERY_LONG_LEGS);
      });
    }
    if (eligible.length === 0) return false;

    // Marking is measured at each interceptor against the passing team.
    const passingTeam = [passer, ...gameService.getTeammates(passer.id)];
    const candidates = eligible.map((e) => {
      const interceptor = gameService.getPlayerById(e.playerId)!;
      const marking = catchController.countMarkingOpponents(
        interceptor.gridPosition!,
        passingTeam
      );
      // Very Long Legs: +2 to the interception Agility Test.
      const vll = hasSkill(interceptor.skills, SkillType.VERY_LONG_LEGS)
        ? 2
        : 0;
      if (vll) {
        eventBus.emit(GameEventNames.SkillTriggered, {
          playerId: e.playerId,
          skill: SkillType.VERY_LONG_LEGS,
          effect:
            "Very Long Legs: +2 to the interception (ignores Cloud Burster)",
        });
      }
      return {
        playerId: e.playerId,
        base: e.modifier + vll,
        marking,
        modifier: e.modifier + vll - marking,
      };
    });

    const chooserTeamId = gameService.getPlayerById(
      candidates[0].playerId
    )!.teamId;

    const answer = (await gameService.getDecisionService().request({
      type: "interception",
      chooserTeamId,
      passerId: passer.id,
      candidates: candidates.map((c) => ({
        playerId: c.playerId,
        playerName: gameService.getPlayerById(c.playerId)?.playerName,
        modifier: c.modifier,
      })),
    })) as InterceptionDecisionAnswer;

    const chosen = answer.playerId
      ? candidates.find((c) => c.playerId === answer.playerId)
      : undefined;
    if (!chosen) return false; // declined or invalid

    const interceptor = gameService.getPlayerById(chosen.playerId)!;
    eventBus.emit(GameEventNames.InterceptionAttempted, {
      passerId: passer.id,
      interceptorId: interceptor.id,
      modifier: chosen.modifier,
    });

    const outcome = passController.attemptInterception(
      interceptor,
      chosen.base,
      chosen.marking
    );

    if (!outcome.success) {
      eventBus.emit(GameEventNames.InterceptionFailed, {
        passerId: passer.id,
        interceptorId: interceptor.id,
        roll: outcome.roll,
      });
      return false;
    }

    // Interception! The interceptor gains the ball where they stand and the
    // passing team suffers a turnover; the ball never reaches its landing.
    if (interceptor.gridPosition) {
      gameService.setBallPosition(
        interceptor.gridPosition.x,
        interceptor.gridPosition.y
      );
    }
    eventBus.emit(GameEventNames.PassIntercepted, {
      passerId: passer.id,
      interceptorId: interceptor.id,
      position: interceptor.gridPosition!,
    });
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${interceptor.playerName} intercepts the pass!`
    );
    gameService.getState().ballPosition = interceptor.gridPosition!;
    gameService.triggerTurnover("Intercepted");
    return true;
  }
}

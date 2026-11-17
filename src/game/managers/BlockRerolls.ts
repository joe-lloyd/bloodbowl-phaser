import { Player } from "@/types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import {
  BlockResult,
  BlockRollData,
} from "../../services/BlockResolutionService";
import { GameEventNames } from "../../types/events";
import { spendTeamReroll } from "../skills";
import { BlockManagerBase } from "./BlockManagerBase";

/**
 * The block roll as it stands now, for listeners. A re-roll or a kept roll
 * changes the pending roll in place; sending the same object again would
 * leave a listener that kept the last one, such as the block dialog's
 * React state, seeing nothing new.
 */
export const snapshotRoll = (roll: BlockRollData): BlockRollData => ({
  ...roll,
  results: [...roll.results],
});

/** Each block die's face as the log names it, e.g. "Attacker Down". */
const faces = (results: BlockResult[]): string[] => results.map((r) => r.label);

/**
 * Veteran (D8): "would be Knocked Down by their own Block". With the
 * attacker's choice that is when every die knocks them down; with the
 * defender's choice, when any die does. Player Down always does; Both
 * Down does unless the attacker has Block.
 */
const blockKnocksAttackerDown = (
  attacker: Player,
  results: BlockResult[],
  isAttackerChoice: boolean
): boolean => {
  const knocksDown = (result: BlockResult) =>
    result.type === "skull" ||
    (result.type === "both-down" &&
      !hasSkill(attacker.skills, SkillType.BLOCK));
  return isAttackerChoice
    ? results.length > 0 && results.every(knocksDown)
    : results.some(knocksDown);
};

/** The re-rolls a coach may spend on the block dice before picking a result. */
export abstract class BlockRerolls extends BlockManagerBase {
  /** The block roll awaiting the coach's result choice (for re-rolls). */
  protected pendingBlockRoll: BlockRollData | null = null;

  /** Which block-dice re-rolls the attacker may use right now. */
  protected blockRerollAvailability(
    attacker: Player | undefined,
    results: BlockResult[],
    isAttackerChoice: boolean
  ): {
    teamRerollAvailable: boolean;
    proAvailable: boolean;
    brawlerAvailable: boolean;
    veteranRerollAvailable: boolean;
  } {
    const gs = this.callbacks.getFlowManager?.()?.context.gameService;
    const arbiter = gs?.getRerollArbiter();
    if (!attacker || !gs || !arbiter) {
      return {
        teamRerollAvailable: false,
        proAvailable: false,
        brawlerAvailable: false,
        veteranRerollAvailable: false,
      };
    }
    return {
      veteranRerollAvailable:
        arbiter.veteranRerollAvailable(attacker) &&
        blockKnocksAttackerDown(attacker, results, isAttackerChoice),
      teamRerollAvailable: arbiter.teamRerollAvailable(attacker.teamId),
      proAvailable: this.proUsable(attacker),
      brawlerAvailable:
        this.brawlerUsable(attacker) &&
        results.some((r) => r.type === "both-down"),
    };
  }

  /** Pro (p.133) re-rolls only the active player's own dice, once a turn. */
  private proUsable(attacker: Player): boolean {
    const gs = this.callbacks.getFlowManager?.()?.context.gameService;
    return (
      !!gs &&
      hasSkill(attacker.skills, SkillType.PRO) &&
      gs.getState().activePlayer?.id === attacker.id &&
      gs.getRerollArbiter().onceAvailable(attacker, SkillType.PRO)
    );
  }

  /**
   * Brawler (2025 rulebook p.127) works "when this player declares a Block
   * Action", so never on a Blitz's Block, and only once per activation:
   * Frenzy's second Block or a Multiple Block cannot use it again (May 2026
   * FAQ). A player activates once per turn, so the per-turn ledger serves.
   */
  private brawlerUsable(attacker: Player): boolean {
    const arbiter = this.callbacks
      .getFlowManager?.()
      ?.context.gameService.getRerollArbiter();
    return (
      !!arbiter &&
      hasSkill(attacker.skills, SkillType.BRAWLER) &&
      this.state.activePlayer?.id === attacker.id &&
      !this.isBlitzBlock(attacker) &&
      arbiter.onceAvailable(attacker, SkillType.BRAWLER)
    );
  }

  /**
   * One re-roll per block: whichever source was tried, the others are now
   * locked out and the coach picks from the dice as they stand.
   */
  private closeRerolls(pending: BlockRollData): void {
    pending.teamRerollAvailable = false;
    pending.proAvailable = false;
    pending.brawlerAvailable = false;
    pending.veteranRerollAvailable = false;
    pending.choiceStage = "pick";
    this.eventBus.emit(GameEventNames.BlockDiceRolled, snapshotRoll(pending));
  }

  public keepBlockDice(attackerId: string): void {
    const pending = this.pendingBlockRoll;
    if (
      !pending ||
      pending.attackerId !== attackerId ||
      pending.choiceStage !== "attacker-reroll"
    )
      return;
    pending.choiceStage = "pick";
    pending.teamRerollAvailable = false;
    pending.proAvailable = false;
    pending.brawlerAvailable = false;
    pending.veteranRerollAvailable = false;
    this.eventBus.emit(GameEventNames.BlockDiceKept, snapshotRoll(pending));
  }

  /**
   * Team Re-roll on a block: re-roll ALL the dice. One re-roll per block, so
   * Pro and Brawler are locked out afterwards. A failed Loner roll spends
   * the re-roll and leaves the original dice standing.
   */
  public teamRerollBlock(attackerId: string): void {
    const pending = this.pendingBlockRoll;
    if (!pending || pending.attackerId !== attackerId) return;
    const attacker = this.getPlayerById(attackerId);
    const gameService = this.callbacks.getFlowManager?.()?.context.gameService;
    if (
      !attacker ||
      !gameService ||
      !gameService.getRerollArbiter().teamRerollAvailable(attacker.teamId)
    ) {
      return;
    }
    if (spendTeamReroll({ gameService, eventBus: this.eventBus }, attacker)) {
      const before = pending.results;
      pending.results = this.diceController.rollBlockDice(
        pending.numDice,
        attacker.teamId
      );
      this.eventBus.emit(GameEventNames.RerollUsed, {
        playerId: attackerId,
        source: "team",
        rollKind: "block",
        before: faces(before),
        after: faces(pending.results),
      });
    }
    this.closeRerolls(pending);
  }

  /**
   * Pro on a block: re-roll a SINGLE die (3+ to use). Once attempted, no
   * other re-roll source may be used on this block (rulebook p.133).
   */
  public proRerollBlockDie(attackerId: string, dieIndex: number): void {
    const pending = this.pendingBlockRoll;
    if (!pending || pending.attackerId !== attackerId) return;
    if (dieIndex < 0 || dieIndex >= pending.results.length) return;
    const attacker = this.getPlayerById(attackerId);
    const arbiter = this.callbacks
      .getFlowManager?.()
      ?.context.gameService.getRerollArbiter();
    if (!attacker || !arbiter || !this.proUsable(attacker)) return;

    // Once Pro is attempted the die is committed to Pro — no other source.
    arbiter.consumeOnce(attacker, SkillType.PRO);
    const gate = this.diceController.rollSkillCheck(
      "Pro",
      3,
      0,
      attacker.playerName
    );
    if (gate.success) {
      const before = faces(pending.results);
      pending.results[dieIndex] = this.diceController.rollBlockDice(
        1,
        attacker.teamId
      )[0];
      this.eventBus.emit(GameEventNames.RerollUsed, {
        playerId: attackerId,
        source: "pro",
        rollKind: "block",
        before,
        after: faces(pending.results),
      });
      this.eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: attackerId,
        skill: SkillType.PRO,
        effect: "Pro: re-rolled a block die",
      });
    } else {
      this.eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: attackerId,
        skill: SkillType.PRO,
        effect: "Pro: the attempt fails — no other re-roll may be used",
      });
    }
    this.closeRerolls(pending);
  }

  /**
   * Brawler on a block (2025 rulebook p.127): re-roll the single Both Down
   * die. No skill check is needed — unlike Pro it just works — but it may
   * only be used once per activation, and (matching Pro/Team Re-roll's mutual
   * exclusion) it locks out the other re-roll sources on this block.
   */
  public brawlerRerollBlockDie(attackerId: string): void {
    const pending = this.pendingBlockRoll;
    if (!pending || pending.attackerId !== attackerId) return;
    if (!pending.brawlerAvailable) return;
    const attacker = this.getPlayerById(attackerId);
    // Defense-in-depth, matching Pro: re-derive eligibility rather than
    // trusting the cached `pending.brawlerAvailable` flag alone (host
    // authority — see proRerollBlockDie's identical re-check).
    if (!attacker || !this.brawlerUsable(attacker)) return;
    const index = pending.results.findIndex((r) => r.type === "both-down");
    if (index < 0) return;

    this.callbacks
      .getFlowManager?.()
      ?.context.gameService.getRerollArbiter()
      .consumeOnce(attacker, SkillType.BRAWLER);

    const before = faces(pending.results);
    pending.results[index] = this.diceController.rollBlockDice(
      1,
      attacker.teamId
    )[0];
    this.eventBus.emit(GameEventNames.RerollUsed, {
      playerId: attackerId,
      source: "skill",
      skill: SkillType.BRAWLER,
      rollKind: "block",
      before,
      after: faces(pending.results),
    });
    this.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: attackerId,
      skill: SkillType.BRAWLER,
      effect: "Brawler: re-rolled a Both Down",
    });
    this.closeRerolls(pending);
  }

  /**
   * Veteran on a block (Sevens D8): once per game, re-roll ALL the dice of
   * a block that would Knock the Veteran Down. Like a Team Re-roll it locks
   * out the other sources on this block.
   */
  public veteranRerollBlock(attackerId: string): void {
    const pending = this.pendingBlockRoll;
    if (!pending || pending.attackerId !== attackerId) return;
    const attacker = this.getPlayerById(attackerId);
    const arbiter = this.callbacks
      .getFlowManager?.()
      ?.context.gameService.getRerollArbiter();
    // Re-derive eligibility rather than trusting the cached flag (host
    // authority, as for Pro and Brawler).
    if (
      !attacker ||
      !arbiter ||
      !arbiter.veteranRerollAvailable(attacker) ||
      !blockKnocksAttackerDown(
        attacker,
        pending.results,
        pending.isAttackerChoice
      )
    ) {
      return;
    }
    arbiter.consumeVeteranReroll(attacker);
    const before = pending.results;
    pending.results = this.diceController.rollBlockDice(
      pending.numDice,
      attacker.teamId
    );
    this.eventBus.emit(GameEventNames.RerollUsed, {
      playerId: attackerId,
      source: "veteran",
      rollKind: "block",
      before: faces(before),
      after: faces(pending.results),
    });
    this.closeRerolls(pending);
  }
}

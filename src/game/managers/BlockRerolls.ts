import { type Player } from "@/types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import {
  type BlockResult,
  type BlockRollData,
} from "../../services/BlockResolutionService";
import { GameEventNames } from "../../types/events";
import { spendTeamReroll } from "../skills";
import { BlockManagerBase } from "./BlockManagerBase";
import { teamRerollBarred } from "../kickoff/ballConditions";

export const snapshotRoll = (roll: BlockRollData): BlockRollData => ({
  ...roll,
  results: [...roll.results],
});

const faces = (results: BlockResult[]): string[] => results.map((r) => r.label);

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

export abstract class BlockRerolls extends BlockManagerBase {
  protected pendingBlockRoll: BlockRollData | null = null;

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
      teamRerollAvailable:
        arbiter.teamRerollAvailable(attacker.teamId) &&
        !teamRerollBarred(this.state, "block"),
      proAvailable: this.proUsable(attacker),
      brawlerAvailable:
        this.brawlerUsable(attacker) &&
        results.some((r) => r.type === "both-down"),
    };
  }

  private proUsable(attacker: Player): boolean {
    const gs = this.callbacks.getFlowManager?.()?.context.gameService;
    return (
      !!gs &&
      hasSkill(attacker.skills, SkillType.PRO) &&
      gs.getState().activePlayer?.id === attacker.id &&
      gs.getRerollArbiter().onceAvailable(attacker, SkillType.PRO)
    );
  }

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

  public teamRerollBlock(attackerId: string): void {
    const pending = this.pendingBlockRoll;
    if (!pending || pending.attackerId !== attackerId) return;
    const attacker = this.getPlayerById(attackerId);
    const gameService = this.callbacks.getFlowManager?.()?.context.gameService;
    if (
      !attacker ||
      !gameService?.getRerollArbiter().teamRerollAvailable(attacker.teamId) ||
      teamRerollBarred(this.state, "block")
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

  public proRerollBlockDie(attackerId: string, dieIndex: number): void {
    const pending = this.pendingBlockRoll;
    if (!pending || pending.attackerId !== attackerId) return;
    if (dieIndex < 0 || dieIndex >= pending.results.length) return;
    const attacker = this.getPlayerById(attackerId);
    const arbiter = this.callbacks
      .getFlowManager?.()
      ?.context.gameService.getRerollArbiter();
    if (!attacker || !arbiter || !this.proUsable(attacker)) return;

    arbiter.consumeOnce(attacker, SkillType.PRO);
    const gate = this.diceController.rollSkillCheck(
      { reason: "Pro",target: 3,modifier: 0,playerName: attacker.playerName }    );
    if (gate.success) {
      const before = faces(pending.results);
      pending.results[dieIndex] = this.rollOneBlockDie(attacker.teamId);
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

  private rollOneBlockDie(teamId: string): BlockResult {
    const [result] = this.diceController.rollBlockDice(1, teamId);
    if (!result) throw new Error("Block dice roll returned no result");
    return result;
  }

  public brawlerRerollBlockDie(attackerId: string): void {
    const pending = this.pendingBlockRoll;
    if (!pending || pending.attackerId !== attackerId) return;
    if (!pending.brawlerAvailable) return;
    const attacker = this.getPlayerById(attackerId);

    if (!attacker || !this.brawlerUsable(attacker)) return;
    const index = pending.results.findIndex((r) => r.type === "both-down");
    if (index === -1) return;

    this.callbacks
      .getFlowManager?.()
      ?.context.gameService.getRerollArbiter()
      .consumeOnce(attacker, SkillType.BRAWLER);

    const before = faces(pending.results);
    pending.results[index] = this.rollOneBlockDie(attacker.teamId);
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

  public veteranRerollBlock(attackerId: string): void {
    const pending = this.pendingBlockRoll;
    if (!pending || pending.attackerId !== attackerId) return;
    const attacker = this.getPlayerById(attackerId);
    const arbiter = this.callbacks
      .getFlowManager?.()
      ?.context.gameService.getRerollArbiter();

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

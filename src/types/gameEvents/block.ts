/**
 * Event payloads for blocks and what follows them: block dice, pushes,
 * armour, injury and the crowd.
 */

import { GameEventNames } from "./names";
import { BlockResult } from "../../services/BlockResolutionService";

export interface BlockGameEvents {
  // Block Events
  [GameEventNames.BlockDiceKept]: import("../../services/BlockResolutionService").BlockRollData;
  [GameEventNames.BlockDiceRolled]: import("../../services/BlockResolutionService").BlockRollData;

  [GameEventNames.ArmorRolled]: {
    playerId: string;
    /** The roll with its modifiers. */
    roll: number;
    /** The player's Armour Value this drive. */
    armor: number;
    broken: boolean;
  };
  [GameEventNames.InjuryRolled]: {
    playerId: string;
    result: import("../../game/controllers/InjuryController").InjuryResult;
  };

  [GameEventNames.PlayerKnockedDown]: {
    playerId: string;
    // ... details?
  };
  [GameEventNames.PlayerCasualtyInflicted]: {
    causerId?: string;
    victimId: string;
    cause:
      | "block"
      | "special"
      | "dodge"
      | "crowd"
      | "lethal-flight"
      | "lash-out";
    sppEligible: boolean;
  };
  [GameEventNames.PlayerKilled]: {
    causerId?: string;
    victimId: string;
  };

  // End of drive
  [GameEventNames.KORecoveryRolled]: {
    playerId: string;
    roll: number;
    recovered: boolean;
  };
  [GameEventNames.PlayerPushedIntoCrowd]: {
    playerId: string;
    exitSquare: { x: number; y: number };
  };
}

export interface BlockUIEvents {
  // Block
  [GameEventNames.UI_BlockResultSelected]: {
    attackerId: string;
    defenderId: string;
    result: BlockResult;
  };

  // Block
  [GameEventNames.UI_BlockDialog]: {
    attackerId: string;
    defenderId: string;
    analysis: import("../Actions").BlockAnalysis;
  };

  [GameEventNames.UI_RollBlockDice]: {
    attackerId: string;
    defenderId: string;
    numDice: number;
    isAttackerChoice: boolean;
  };

  /** The requested block roll will not happen (illegal, no movement left,
   * rush declined/failed) — dialogs waiting on dice must close. */
  [GameEventNames.UI_BlockRollCancelled]: void;
  [GameEventNames.UI_BlockDieClicked]: { index: number };

  [GameEventNames.UI_SelectPushDirection]: {
    defenderId: string;
    attackerId: string;
    validDirections: { x: number; y: number }[];
    canFollowUp: boolean;
    resultType?: string;
    /** Team whose coach places the push (the pushed player's on Sidestep) */
    chooserTeamId?: string;
    /** Which rulebook tier the offered squares are: open, chain, or crowd */
    pushTier?: "open" | "chain" | "crowd";
  };

  [GameEventNames.UI_PushDirectionSelected]: {
    defenderId: string;
    direction: { x: number; y: number };
    canFollowUp: boolean;
  };

  [GameEventNames.UI_FollowUpPrompt]: {
    attackerId: string;
    targetSquare: { x: number; y: number };
    /**
     * The board repeating an offer the engine already announced, once its
     * push animation has played. It opens the dialog; it is not a new decision.
     */
    repeat?: true;
  };

  [GameEventNames.UI_FollowUpResponse]: {
    attackerId: string;
    followUp: boolean;
    targetSquare?: { x: number; y: number };
  };
  /** A Blitz block resolved with movement left — resume the move. */
  [GameEventNames.UI_ResumeBlitzMove]: {
    playerId: string;
  };

  /** A Ball & Chain square resolved with squares left: pick the next facing. */
  [GameEventNames.UI_ResumeBallAndChain]: {
    playerId: string;
  };

  /** Keep the uphill dice and let the defender pick. */
  [GameEventNames.UI_KeepBlockDice]: { attackerId: string };
  /** Spend a Team Re-roll on a block (re-roll all the dice). */
  [GameEventNames.UI_TeamRerollBlock]: { attackerId: string };
  /** Spend Pro on a block (re-roll one die). */
  [GameEventNames.UI_ProRerollBlockDie]: {
    attackerId: string;
    dieIndex: number;
  };
  /** Spend Brawler on a block (re-roll the single Both Down die). */
  [GameEventNames.UI_BrawlerRerollBlockDie]: { attackerId: string };
  /** Spend the Veteran's once-per-game re-roll on all the block dice. */
  [GameEventNames.UI_VeteranRerollBlock]: { attackerId: string };
}

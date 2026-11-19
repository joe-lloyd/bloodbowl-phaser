import { GameEventNames } from "./names";
import { type BlockResult } from "../../services/BlockResolutionService";

export interface BlockGameEvents {
  [GameEventNames.BlockDiceKept]: import("../../services/BlockResolutionService").BlockRollData;
  [GameEventNames.BlockDiceRolled]: import("../../services/BlockResolutionService").BlockRollData;

  [GameEventNames.ArmorRolled]: {
    playerId: string;

    roll: number;

    armor: number;
    broken: boolean;

    rollType: string;

    diceTeamId?: string;
  };
  [GameEventNames.InjuryRolled]: {
    playerId: string;
    result: import("../../game/controllers/InjuryController").InjuryResult;

    rollType: string;

    diceTeamId?: string;

    stunnedToReserves?: true;
  };

  [GameEventNames.PlayerKnockedDown]: {
    playerId: string;
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
  [GameEventNames.UI_BlockResultSelected]: {
    attackerId: string;
    defenderId: string;
    result: BlockResult;
  };

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

  [GameEventNames.UI_BlockRollCancelled]: void;
  [GameEventNames.UI_BlockDieClicked]: { index: number };

  [GameEventNames.UI_SelectPushDirection]: {
    defenderId: string;
    attackerId: string;
    validDirections: { x: number; y: number }[];
    canFollowUp: boolean;
    resultType?: string;

    chooserTeamId?: string;

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

    repeat?: true;
  };

  [GameEventNames.UI_FollowUpResponse]: {
    attackerId: string;
    followUp: boolean;
    targetSquare?: { x: number; y: number };
  };

  [GameEventNames.UI_ResumeBlitzMove]: {
    playerId: string;
  };

  [GameEventNames.UI_ResumeBallAndChain]: {
    playerId: string;
  };

  [GameEventNames.UI_KeepBlockDice]: { attackerId: string };

  [GameEventNames.UI_TeamRerollBlock]: { attackerId: string };

  [GameEventNames.UI_ProRerollBlockDie]: {
    attackerId: string;
    dieIndex: number;
  };

  [GameEventNames.UI_BrawlerRerollBlockDie]: { attackerId: string };

  [GameEventNames.UI_VeteranRerollBlock]: { attackerId: string };
}

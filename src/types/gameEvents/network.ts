import { GameEventNames } from "./names";

export interface NetworkGameEvents {
  [GameEventNames.RemoteSelectionChanged]: { playerId: string | null };
  [GameEventNames.RemotePromptChanged]: StepPrompt | null;
}

export interface NetworkUIEvents {
  [GameEventNames.UI_ShowOtherCoachMove]: {
    from: { x: number; y: number };
    path: { x: number; y: number }[];
    ma: number;
  };
  [GameEventNames.UI_OtherCoachMoveResolved]: { playerId: string };
  [GameEventNames.UI_SyncBoard]: { positions: true } | void;
  [GameEventNames.NetworkCommandRejected]: {
    commandType: string;

    playerId?: string;

    action?: string;
    reason: string;
  };

  [GameEventNames.UI_PassAimed]: StepPrompt | null;
}

export type PromptRollType =
  | "dodge"
  | "rush"
  | "pickup"
  | "secureBall"
  | "pass"
  | "catch"
  | "armour";

export interface StepPrompt {
  playerId: string;
  rolls: { type: PromptRollType; target: number }[];
}

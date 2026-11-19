import { type GameState } from "./GameState";
import { type Team } from "./Team";
import { type Player } from "./Player";
import { GameEventNames } from "./gameEvents/names";
import type { MatchGameEvents } from "./gameEvents/match";
import type { BlockGameEvents, BlockUIEvents } from "./gameEvents/block";
import type { PassGameEvents, PassUIEvents } from "./gameEvents/pass";
import type { KickoffGameEvents, KickoffUIEvents } from "./gameEvents/kickoff";
import type { NetworkGameEvents, NetworkUIEvents } from "./gameEvents/network";
import type { CommonUIEvents } from "./gameEvents/ui";

export { GameEventNames };
export type { ActionType, RefereeCallStep } from "./gameEvents/match";
export type {  StepPrompt } from "./gameEvents/network";
export type {
  LogEntryCategory,
  AnnouncementKind,
  MatchMoment,
  
} from "./gameEvents/ui";

export interface GameEvents
  extends
    MatchGameEvents,
    BlockGameEvents,
    PassGameEvents,
    KickoffGameEvents,
    NetworkGameEvents {}

export interface UIEvents
  extends
    BlockUIEvents,
    PassUIEvents,
    KickoffUIEvents,
    NetworkUIEvents,
    CommonUIEvents {}

interface StateEvents {
  [GameEventNames.TeamUpdated]: { team: Team };
  [GameEventNames.GameStateChanged]: { state: GameState };
  [GameEventNames.PlayerUpdated]: { player: Player };
}

export type AllEvents = GameEvents & UIEvents & StateEvents;

/**
 * Event Types for the Game
 *
 * Type-safe event definitions for communication between Phaser game logic
 * and React UI components via the EventBus.
 */

import { GameState } from "./GameState";
import { Team } from "./Team";
import { Player } from "./Player";
import { GameEventNames } from "./gameEvents/names";
import type { MatchGameEvents } from "./gameEvents/match";
import type { BlockGameEvents, BlockUIEvents } from "./gameEvents/block";
import type { PassGameEvents, PassUIEvents } from "./gameEvents/pass";
import type { KickoffGameEvents, KickoffUIEvents } from "./gameEvents/kickoff";
import type { NetworkGameEvents, NetworkUIEvents } from "./gameEvents/network";
import type { CommonUIEvents } from "./gameEvents/ui";

export { GameEventNames };
export type { ActionType } from "./gameEvents/match";
export type { PromptRollType, StepPrompt } from "./gameEvents/network";
export type {
  LogEntryCategory,
  AnnouncementKind,
  AnnouncementMoment,
  MatchMoment,
  InfoPanelSubject,
} from "./gameEvents/ui";

/**
 * Game Events - Emitted by GameService/Phaser
 * React components subscribe to these to update UI
 */
export interface GameEvents
  extends MatchGameEvents,
    BlockGameEvents,
    PassGameEvents,
    KickoffGameEvents,
    NetworkGameEvents {}

/**
 * UI Events - Emitted by React components
 * GameService/Phaser subscribes to these to handle user actions
 */
export interface UIEvents
  extends BlockUIEvents,
    PassUIEvents,
    KickoffUIEvents,
    NetworkUIEvents,
    CommonUIEvents {}

/**
 * State Update Events - For synchronizing state
 */
export interface StateEvents {
  [GameEventNames.TeamUpdated]: { team: Team };
  [GameEventNames.GameStateChanged]: { state: GameState };
  [GameEventNames.PlayerUpdated]: { player: Player };
}

/**
 * All Events - Union of all event types
 */
export type AllEvents = GameEvents & UIEvents & StateEvents;

/**
 * Helper type for event handlers
 */
export type EventHandler<K extends keyof AllEvents> = (
  data: AllEvents[K]
) => void;

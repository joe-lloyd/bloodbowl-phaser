/**
 * Action types for player actions in Blood Bowl
 */

import { Player } from "./Player";

/**
 * Available player actions
 */
export enum ActionType {
  MOVE = "Move",
  BLOCK = "Block",
  BLITZ = "Blitz",
  PASS = "Pass",
  HANDOFF = "Handoff",
  FOUL = "Foul",
  STANDUP = "StandUp",
}

/**
 * Block dice results
 */
export interface BlockAnalysis {
  diceCount: number; // 1, 2, or 3
  isUphill: boolean; // If true, Defender chooses result (Red Dice)
  attackerST: number;
  defenderST: number;
  attackerAssists: Player[];
  defenderAssists: Player[];
}

export enum BlockResult {
  ATTACKER_DOWN = "Attacker Down",
  BOTH_DOWN = "Both Down",
  PUSH = "Push",
  DEFENDER_STUMBLES = "Defender Stumbles",
  DEFENDER_DOWN = "Defender Down",
}

/**
 * Pass distance categories
 */
export enum PassDistance {
  QUICK = "Quick", // 1-3 squares, no modifier
  SHORT = "Short", // 4-6 squares, -1
  LONG = "Long", // 7-10 squares, -2
  BOMB = "Bomb", // 11+ squares, -3
}

/**
 * Move action
 */
export interface MoveAction {
  type: ActionType.MOVE;
  player: Player;
  path: { x: number; y: number }[]; // Squares to move through
  requiresDodge: boolean[]; // Which squares need dodge rolls
}

/**
 * Block action
 */
export interface BlockAction {
  type: ActionType.BLOCK;
  attacker: Player;
  defender: Player;
  diceCount: number; // 1-3 based on ST comparison
  results: BlockResult[]; // Dice results
  chosenResult?: BlockResult; // Player's choice (if multiple dice)
}

/**
 * Blitz action (move + block)
 */
export interface BlitzAction {
  type: ActionType.BLITZ;
  player: Player;
  movePath: { x: number; y: number }[];
  blockTarget: Player;
  blockPosition: { x: number; y: number }; // Where block occurs
}

/**
 * Pass action
 */
export interface PassAction {
  type: ActionType.PASS;
  thrower: Player;
  target: { x: number; y: number };
  distance: PassDistance;
  receiver?: Player; // If targeting a player
}

/**
 * Hand-off action
 */
export interface HandoffAction {
  type: ActionType.HANDOFF;
  giver: Player;
  receiver: Player;
}

/**
 * Foul action
 */
export interface FoulAction {
  type: ActionType.FOUL;
  fouler: Player;
  target: Player;
  assists: number; // Number of assisting players
}

/**
 * Stand up action
 */
export interface StandupAction {
  type: ActionType.STANDUP;
  player: Player;
}

/**
 * Union type for all actions
 */
export type PlayerAction =
  | MoveAction
  | BlockAction
  | BlitzAction
  | PassAction
  | HandoffAction
  | FoulAction
  | StandupAction;

/**
 * Action validation result
 */
export interface ActionValidation {
  valid: boolean;
  reason?: string;
}

/**
 * Check if action is valid
 */
export function validateAction(action: PlayerAction): ActionValidation {
  // Basic validation - will be expanded in implementation
  switch (action.type) {
    case ActionType.MOVE:
      if (action.path.length === 0) {
        return { valid: false, reason: "No movement path specified" };
      }
      if (action.player.hasActed) {
        return { valid: false, reason: "Player has already acted this turn" };
      }
      return { valid: true };

    case ActionType.BLOCK:
      if (action.attacker.hasActed) {
        return { valid: false, reason: "Player has already acted this turn" };
      }
      return { valid: true };

    case ActionType.BLITZ:
      if (action.player.hasActed) {
        return { valid: false, reason: "Player has already acted this turn" };
      }
      return { valid: true };

    case ActionType.PASS:
      if (action.thrower.hasActed) {
        return { valid: false, reason: "Player has already acted this turn" };
      }
      return { valid: true };

    case ActionType.HANDOFF:
      if (action.giver.hasActed) {
        return { valid: false, reason: "Player has already acted this turn" };
      }
      return { valid: true };

    case ActionType.FOUL:
      if (action.fouler.hasActed) {
        return { valid: false, reason: "Player has already acted this turn" };
      }
      return { valid: true };

    case ActionType.STANDUP:
      if (action.player.status !== "Prone") {
        return { valid: false, reason: "Player is not prone" };
      }
      return { valid: true };

    default:
      return { valid: false, reason: "Unknown action type" };
  }
}

/**
 * Calculate block dice count based on strength comparison
 */
export function calculateBlockDice(
  attackerST: number,
  defenderST: number
): number {
  if (attackerST > defenderST) return 2;
  if (attackerST < defenderST) return 1;
  return 1; // Equal strength
}

/**
 * Calculate pass distance category
 */
export function calculatePassDistance(
  from: { x: number; y: number },
  to: { x: number; y: number }
): PassDistance {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance <= 3) return PassDistance.QUICK;
  if (distance <= 6) return PassDistance.SHORT;
  if (distance <= 10) return PassDistance.LONG;
  return PassDistance.BOMB;
}

/**
 * Get pass modifier based on distance
 */
export function getPassModifier(distance: PassDistance): number {
  switch (distance) {
    case PassDistance.QUICK:
      return 0;
    case PassDistance.SHORT:
      return -1;
    case PassDistance.LONG:
      return -2;
    case PassDistance.BOMB:
      return -3;
  }
}

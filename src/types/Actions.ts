import { type Player } from "./Player";

const ActionType = {
  MOVE: "Move",
  BLOCK: "Block",
  BLITZ: "Blitz",
  PASS: "Pass",
  HANDOFF: "Handoff",
  FOUL: "Foul",
  STANDUP: "StandUp",
} as const;
type ActionType = (typeof ActionType)[keyof typeof ActionType];

export interface BlockAnalysis {
  diceCount: number;
  isUphill: boolean;
  attackerST: number;
  defenderST: number;
  attackerAssists: Player[];
  defenderAssists: Player[];
}

const BlockResult = {
  ATTACKER_DOWN: "Attacker Down",
  BOTH_DOWN: "Both Down",
  PUSH: "Push",
  DEFENDER_STUMBLES: "Defender Stumbles",
  DEFENDER_DOWN: "Defender Down",
} as const;
type BlockResult = (typeof BlockResult)[keyof typeof BlockResult];

const PassDistance = {
  QUICK: "Quick",
  SHORT: "Short",
  LONG: "Long",
  BOMB: "Bomb",
} as const;
type PassDistance = (typeof PassDistance)[keyof typeof PassDistance];

interface MoveAction {
  type: typeof ActionType.MOVE;
  player: Player;
  path: { x: number; y: number }[];
  requiresDodge: boolean[];
}

interface BlockAction {
  type: typeof ActionType.BLOCK;
  attacker: Player;
  defender: Player;
  diceCount: number;
  results: BlockResult[];
  chosenResult?: BlockResult;
}

interface BlitzAction {
  type: typeof ActionType.BLITZ;
  player: Player;
  movePath: { x: number; y: number }[];
  blockTarget: Player;
  blockPosition: { x: number; y: number };
}

interface PassAction {
  type: typeof ActionType.PASS;
  thrower: Player;
  target: { x: number; y: number };
  distance: PassDistance;
  receiver?: Player;
}

interface HandoffAction {
  type: typeof ActionType.HANDOFF;
  giver: Player;
  receiver: Player;
}

interface FoulAction {
  type: typeof ActionType.FOUL;
  fouler: Player;
  target: Player;
  assists: number;
}

interface StandupAction {
  type: typeof ActionType.STANDUP;
  player: Player;
}

type PlayerAction =
  | MoveAction
  | BlockAction
  | BlitzAction
  | PassAction
  | HandoffAction
  | FoulAction
  | StandupAction;

interface ActionValidation {
  valid: boolean;
  reason?: string;
}

function validateAction(action: PlayerAction): ActionValidation {
  switch (action.type) {
    case ActionType.MOVE:
      if (action.path.length === 0) {
        return { valid: false, reason: "No movement path specified" };
      }
      return notYetActed(action.player);

    case ActionType.BLOCK:
      return notYetActed(action.attacker);

    case ActionType.BLITZ:
      return notYetActed(action.player);

    case ActionType.PASS:
      return notYetActed(action.thrower);

    case ActionType.HANDOFF:
      return notYetActed(action.giver);

    case ActionType.FOUL:
      return notYetActed(action.fouler);

    case ActionType.STANDUP:
      if (action.player.status !== "Prone") {
        return { valid: false, reason: "Player is not prone" };
      }
      return { valid: true };

    default:
      return { valid: false, reason: "Unknown action type" };
  }
}

function notYetActed(player: Pick<Player, "hasActed">): ActionValidation {
  return player.hasActed
    ? { valid: false, reason: "Player has already acted this turn" }
    : { valid: true };
}

function calculateBlockDice(
  attackerST: number,
  defenderST: number
): number {
  if (attackerST > defenderST) return 2;
  if (attackerST < defenderST) return 1;
  return 1;
}

function calculatePassDistance(
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

function getPassModifier(distance: PassDistance): number {
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

/**
 * Command shapes - the fields each command must carry, checked before a
 * command reaches the game so a malformed one is refused with a reason.
 */

import { HeadlessCommand } from "./protocol";

type FieldKind =
  | "string"
  | "integer"
  | "boolean"
  | "boolean?"
  | "string?"
  | "integer?"
  | "path"
  | "formation"
  | "string-array";
type CommandShape = Record<string, FieldKind>;

/** Field requirements per command type, used for malformed-command rejection. */
const COMMAND_SHAPES: Record<string, CommandShape> = {
  "coin-flip": {},
  "ready-weather": { teamId: "string" },
  "start-setup": { kickingTeamId: "string" },
  "place-player": { playerId: "string", x: "integer", y: "integer" },
  "remove-player": { playerId: "string" },
  "swap-players": { player1Id: "string", player2Id: "string" },
  "apply-formation": { teamId: "string", formation: "formation" },
  "setup-concession": { teamId: "string", concede: "boolean" },
  "confirm-setup": { teamId: "string" },
  "select-kicker": { playerId: "string" },
  "kick-ball": {
    playerId: "string?",
    teamId: "string?",
    x: "integer",
    y: "integer",
  },
  "kickoff-select-player": { playerId: "string" },
  "kickoff-move-player": { playerId: "string", x: "integer", y: "integer" },
  "kickoff-place-player": { playerId: "string", x: "integer", y: "integer" },
  "kickoff-confirm": {},
  "kickoff-skip": {},
  "declare-action": {
    playerId: "string",
    action: "string",
    razzleDazzle: "boolean?",
  },
  "cancel-action": { playerId: "string" },
  move: { playerId: "string", path: "path" },
  fumblerooski: { playerId: "string", x: "integer", y: "integer" },
  jump: { playerId: "string", x: "integer", y: "integer" },
  "stand-up": { playerId: "string" },
  block: { attackerId: "string", defenderId: "string" },
  "multiple-block": {
    attackerId: "string",
    defender1Id: "string",
    defender2Id: "string",
  },
  pass: {
    playerId: "string",
    x: "integer",
    y: "integer",
    hailMary: "boolean?",
  },
  punt: { playerId: "string", x: "integer", y: "integer" },
  handoff: { playerId: "string", targetId: "string" },
  foul: { playerId: "string", x: "integer", y: "integer" },
  stab: { attackerId: "string", defenderId: "string" },
  "throw-teammate": {
    throwerId: "string",
    teammateId: "string",
    x: "integer",
    y: "integer",
    swoopFacing: "string?",
  },
  "throw-bomb": { throwerId: "string", x: "integer", y: "integer" },
  "ball-and-chain": { playerId: "string", x: "integer", y: "integer" },
  "keep-block-dice": { attackerId: "string" },
  "team-reroll-block": { attackerId: "string" },
  "pro-reroll-block": { attackerId: "string", dieIndex: "integer" },
  "brawler-reroll-block": { attackerId: "string" },
  "veteran-reroll-block": { attackerId: "string" },
  "special-action": {
    action: "string",
    attackerId: "string",
    defenderId: "string",
  },
  "end-activation": { playerId: "string" },
  "end-turn": {},
  "award-mvp": { teamId: "string", nominatedPlayerIds: "string-array" },
  "assign-awarded-touchdown": { playerId: "string" },
  "choose-block-result": { index: "integer" },
  "choose-push-direction": { x: "integer", y: "integer" },
  "choose-follow-up": { followUp: "boolean" },
  "use-reroll": { accept: "boolean" },
  "use-reaction": { accept: "boolean" },
  "choose-bite-target": { playerId: "string?" },
  "choose-interception": {},
  touchback: { playerId: "string" },
  "use-apothecary": { accept: "boolean" },
  "choose-inducement": {
    playerId: "string?",
    skill: "string?",
    stat: "string?",
    spell: "string?",
    x: "integer?",
    y: "integer?",
  },
  "choose-foul-assists": { count: "integer" },
  "offer-inducements": {},
  "select-inducement": {
    teamId: "string",
    inducement: "string",
    quantity: "integer",
  },
  "remove-inducement": { teamId: "string", inducement: "string" },
  "confirm-inducements": { teamId: "string" },
  state: {},
  "legal-actions": {},
} satisfies Record<HeadlessCommand["type"], CommandShape>;

/** A square on the pitch grid: whole coordinates, as every rule assumes. */
function isSquare(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "x" in value &&
    "y" in value &&
    Number.isInteger(value.x) &&
    Number.isInteger(value.y)
  );
}

function isNonEmptyArrayOf(
  value: unknown,
  isEntry: (entry: unknown) => boolean
): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(isEntry);
}

function isFormationPosition(position: unknown): boolean {
  return (
    typeof position === "object" &&
    position !== null &&
    "playerId" in position &&
    typeof position.playerId === "string" &&
    isSquare(position)
  );
}

/** How to check each kind of field, and what a bad one is told it must be. */
const FIELD_CHECKS: Record<
  FieldKind,
  { valid: (value: unknown) => boolean; must: string }
> = {
  string: { valid: (v) => typeof v === "string", must: "must be a string" },
  boolean: { valid: (v) => typeof v === "boolean", must: "must be a boolean" },
  "string?": {
    valid: (v) => v === undefined || typeof v === "string",
    must: "must be a string when given",
  },
  "boolean?": {
    valid: (v) => v === undefined || typeof v === "boolean",
    must: "must be a boolean when given",
  },
  integer: { valid: Number.isInteger, must: "must be a whole number" },
  "integer?": {
    valid: (v) => v === undefined || Number.isInteger(v),
    must: "must be a whole number when given",
  },
  path: {
    valid: (v) => isNonEmptyArrayOf(v, isSquare),
    must: "must be a non-empty {x,y}[] of whole squares",
  },
  formation: {
    valid: (v) => isNonEmptyArrayOf(v, isFormationPosition),
    must: "must be a non-empty formation on whole squares",
  },
  "string-array": {
    valid: (v) => isNonEmptyArrayOf(v, (entry) => typeof entry === "string"),
    must: "must be a non-empty string[]",
  },
};

/** Why a command is malformed, or null when its shape is sound. */
export function validateShape(command: unknown): string | null {
  if (typeof command !== "object" || command === null) {
    return "malformed-command: not an object";
  }
  const cmd = command as Record<string, unknown>;
  if (typeof cmd.type !== "string" || !(cmd.type in COMMAND_SHAPES)) {
    return `unknown-command-type: ${String(cmd.type)}`;
  }
  for (const [field, kind] of Object.entries(COMMAND_SHAPES[cmd.type])) {
    const check = FIELD_CHECKS[kind];
    if (!check.valid(cmd[field])) {
      return `malformed-command: '${field}' ${check.must}`;
    }
  }
  return null;
}

import { headlessCommandSchema } from "../../boundary/schemas/HeadlessCommand";
import { z } from "zod";
import { type HeadlessCommand } from "../../headless/protocol";

interface TeamRef {
  id: string;
  players: { id: string }[];
}

export interface RefContext {
  teams: readonly [TeamRef, TeamRef, ...TeamRef[]];
}

const PLAYER_REF = /^(team1|team2):(\d+)$/;

function isTeamRef(ref: string): boolean {
  return ref === "team1" || ref === "team2";
}

function isPlayerRef(ref: string): boolean {
  return PLAYER_REF.test(ref);
}

export function resolveReference(ctx: RefContext, ref: string): string {
  const match = PLAYER_REF.exec(ref);
  if (match) {
    const team = ctx.teams[match[1] === "team1" ? 0 : 1];
    const player = team.players[Number(match[2])];
    if (!player) throw new Error(`no player for ref '${ref}'`);
    return player.id;
  }
  if (ref === "team1") return ctx.teams[0].id;
  if (ref === "team2") return ctx.teams[1].id;
  return ref;
}

const REFERENCE_FIELDS = [
  "playerId",
  "attackerId",
  "defenderId",
  "defender1Id",
  "defender2Id",
  "player1Id",
  "player2Id",
  "throwerId",
  "teammateId",
  "targetId",
  "teamId",
  "kickingTeamId",
] as const;

export function resolveCommandReferences(
  ctx: RefContext,
  command: HeadlessCommand
): HeadlessCommand {
  const resolved: Record<string, unknown> = { ...command };
  for (const field of REFERENCE_FIELDS) {
    const value = resolved[field];
    if (typeof value === "string") {
      resolved[field] = resolveReference(ctx, value);
    }
  }

  if ("nominatedPlayerIds" in command) {
    resolved["nominatedPlayerIds"] = command.nominatedPlayerIds.map((value) =>
      resolveReference(ctx, value)
    );
  }
  return headlessCommandSchema.parse(resolved);
}

export function referencesInCommand(command: HeadlessCommand): string[] {
  const record: Record<string, unknown> = { ...command };
  const refs: string[] = [];
  for (const field of REFERENCE_FIELDS) {
    const value = record[field];
    if (typeof value === "string" && (isPlayerRef(value) || isTeamRef(value))) {
      refs.push(value);
    }
  }
  if ("nominatedPlayerIds" in command) {
    for (const value of command.nominatedPlayerIds) {
      if (isPlayerRef(value)) refs.push(value);
    }
  }
  return refs;
}

export function parsePlayerRef(
  ref: string
): { team: "team1" | "team2"; index: number } | null {
  const match = PLAYER_REF.exec(ref);
  if (!match) return null;
  return {
    team: z.union([z.literal("team1"), z.literal("team2")]).parse(match[1]),
    index: Number(match[2]),
  };
}

import { z } from "zod";
import { playedGameKindSchema } from "./PlayedGameKind";
import { rosterNameSchema } from "./RosterName";
import { playedGamePlayerSchema } from "./PlayedGamePlayer";
import type { PlayedGame } from "../../game/progression/matchHistory";

export const playedGameSchema: z.ZodType<PlayedGame> = z.looseObject({
  id: z.string(),
  playedAt: z.number(),
  kind: playedGameKindSchema,
  fixture: z.string().exactOptional(),
  opponent: z.looseObject({
    name: z.string(),
    rosterName: rosterNameSchema,
  }),
  score: z.looseObject({
    own: z.number(),
    opponent: z.number(),
  }),
  outcome: z.union([z.literal("win"), z.literal("draw"), z.literal("loss")]),
  ending: z
    .union([
      z.literal("conceded"),
      z.literal("forfeited"),
      z.literal("penalties"),
    ])
    .exactOptional(),
  players: playedGamePlayerSchema.array(),
});

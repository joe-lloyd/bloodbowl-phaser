import { z } from "zod";
import type { ClubState, HomeLeague, SeasonRecord } from "../../types/Team";
import { gameTypeSchema } from "./GameType";

const seasonRecordSchema: z.ZodType<SeasonRecord> = z.object({
  season: z.number().int().positive(),
  gameType: gameTypeSchema,
  leagueId: z.string(),
  position: z.number().int().positive(),
  wins: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  champion: z.string(),
  playOff: z
    .enum(["champion", "runner-up", "third", "fourth"])
    .exactOptional(),
});

const homeLeagueSchema: z.ZodType<HomeLeague> = z.object({
  season: z.number().int().positive(),
  rivalIds: z.string().array(),
  benchIds: z.string().array(),
  leagueId: z.string().exactOptional(),
  playOffsId: z.string().exactOptional(),
  trophyHolderId: z.string().exactOptional(),
  redraftWins: z.number().int().nonnegative().exactOptional(),
  newcomerBudget: z.number().int().positive().exactOptional(),
  history: seasonRecordSchema.array(),
});

export const clubStateSchema: z.ZodType<ClubState> = z.object({
  gutterUnlocked: z.literal(true).exactOptional(),
  squads: z
    .object({
      sevens: z.string().array().exactOptional(),
      "street-bowl": z.string().array().exactOptional(),
      "beach-bowl": z.string().array().exactOptional(),
      "gutter-bowl": z.string().array().exactOptional(),
    })
    .exactOptional(),
  matchSquad: z.string().array().exactOptional(),
  trophy: z.literal(true).exactOptional(),
  league: homeLeagueSchema.exactOptional(),
});

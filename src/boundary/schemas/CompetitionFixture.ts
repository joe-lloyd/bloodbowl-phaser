import { z } from "zod";
import { fixtureResultSchema } from "./FixtureResult";
import type { CompetitionFixture } from "../../competition/types";

export const competitionFixtureSchema: z.ZodType<CompetitionFixture> =
  z.looseObject({
    id: z.string(),
    round: z.number(),
    order: z.number(),
    homeEntrantId: z.union([z.null(), z.string()]),
    awayEntrantId: z.union([z.null(), z.string()]),
    status: z.union([
      z.literal("complete"),
      z.literal("scheduled"),
      z.literal("ready"),
    ]),
    result: fixtureResultSchema.exactOptional(),
    sourceFixtureIds: z.string().array().exactOptional(),
    nextFixtureId: z.string().exactOptional(),
    nextSlot: z.union([z.literal("home"), z.literal("away")]).exactOptional(),
    loserNextFixtureId: z.string().exactOptional(),
    loserNextSlot: z.union([z.literal("home"), z.literal("away")]).exactOptional(),
    thirdPlace: z.literal(true).exactOptional(),
  });

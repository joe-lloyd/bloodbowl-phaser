import { z } from "zod";
import type { SeedMetadata } from "../../types/seedMetadata";

export const seedMetadataSchema: z.ZodType<SeedMetadata> = z.looseObject({
  namespace: z.string(),
  version: z.number(),
  fixtureKey: z.string(),
});

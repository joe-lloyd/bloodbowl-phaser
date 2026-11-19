import { z } from "zod";
import type { FixtureWinnings } from "../../game/rules/winnings";

export const fixtureWinningsSchema: z.ZodType<FixtureWinnings> = z.looseObject({
  fanFactor: z.looseObject({
    home: z.number(),
    away: z.number(),
  }),
  home: z.number(),
  away: z.number(),
});

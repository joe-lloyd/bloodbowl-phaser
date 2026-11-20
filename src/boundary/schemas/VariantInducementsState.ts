import { z } from "zod";
import { matchGrantSchema } from "./MatchGrant";
import type { VariantInducementsState } from "../../game/inducements/variantState";

const souvenirSchema = z.union([
  z.literal("Sports Sandals"),
  z.literal("Suntan Lotion"),
  z.literal("Thong"),
  z.literal("Sunglasses"),
  z.literal("Bottle"),
  z.literal("Puka Shell Necklace"),
  z.literal("Sticky Bun"),
  z.literal("Gatorcade"),
]);

export const variantInducementsStateSchema: z.ZodType<VariantInducementsState> =
  z.looseObject({
    effects: z
      .looseObject({
        playerId: z.string(),
        effect: z.union([
          z.literal("act-first"),
          z.literal("orca-cola"),
          z.literal("fungus-beer"),
          z.literal("endurance"),
        ]),
      })
      .array(),
    dosedPlayerIds: z.string().array(),
    souvenirs: z
      .looseObject({
        teamId: z.string(),
        souvenir: souvenirSchema,
        playerId: z.string().exactOptional(),
      })
      .array(),
    souvenirsRolled: z.boolean(),
    halfGrants: matchGrantSchema.array(),
  });

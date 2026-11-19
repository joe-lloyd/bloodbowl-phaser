import { z } from "zod";
import { raceKeyWordSchema } from "./RaceKeyWord";
import { positionKeyWordSchema } from "./PositionKeyWord";
import { traitKeyWordSchema } from "./TraitKeyWord";
import type { KeyWord } from "../../types/Player";

export const keyWordSchema: z.ZodType<KeyWord> = z.union([
  raceKeyWordSchema,
  positionKeyWordSchema,
  traitKeyWordSchema,
]);

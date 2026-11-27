import { z } from "zod";
import {
  EXPERIMENTAL_MATCH_TYPES,
  GAME_TYPES,
} from "../../game/variants/gameTypes";
import { VENUES } from "../../game/variants/pitchLayouts";

export const gameTypeSchema = z.enum(GAME_TYPES);

export const matchTypeSchema = z.enum([
  ...GAME_TYPES,
  ...EXPERIMENTAL_MATCH_TYPES,
]);

export const venueSchema = z.enum(VENUES);

import { z } from "zod";
import { GAME_TYPES } from "../../game/variants/gameTypes";
import { VENUES } from "../../game/variants/pitchLayouts";

export const gameTypeSchema = z.enum(GAME_TYPES);

export const venueSchema = z.enum(VENUES);

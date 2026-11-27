import { z } from "zod";
import tailwind from "../../tailwind.config.js";

const stringRecordSchema = z.record(z.string(), z.string());
const fontFamilySchema = z.record(z.string(), z.string().array());
const lineHeightSchema = z.object({ lineHeight: z.string() });
const fontSizeEntrySchema = z.tuple([z.string(), lineHeightSchema]);
const fontSizeSchema = z.record(z.string(), fontSizeEntrySchema);
const extendSchema = z.object({
  colors: z.object({ hud: stringRecordSchema }),
  fontFamily: fontFamilySchema,
  fontSize: fontSizeSchema,
  spacing: stringRecordSchema,
});
const tokensSchema = z.object({
  theme: z.object({ extend: extendSchema }),
});

export const DESIGN_TOKENS = tokensSchema.parse(tailwind).theme.extend;

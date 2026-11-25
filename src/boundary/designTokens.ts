import { z } from "zod";
import tailwind from "../../tailwind.config.js";

const tokensSchema = z.object({
  theme: z.object({
    extend: z.object({
      colors: z.object({ hud: z.record(z.string(), z.string()) }),
      fontFamily: z.record(z.string(), z.string().array()),
      fontSize: z.record(
        z.string(),
        z.tuple([z.string(), z.object({ lineHeight: z.string() })])
      ),
      spacing: z.record(z.string(), z.string()),
    }),
  }),
});

export const DESIGN_TOKENS = tokensSchema.parse(tailwind).theme.extend;

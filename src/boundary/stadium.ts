import { z } from "zod";

const coordinate = z.tuple([z.number(), z.number()]);
const dugout = z.object({
  reserves: z.array(coordinate),
  ko: z.array(coordinate),
  injured: z.array(coordinate),
  "sent off": z.array(coordinate),
});

const sizeLo = z.object({
  width: z.number(),
  height: z.number(),
  px_per_unit: z.number(),
  origin: coordinate,
});

const stadiumMeta = z.object({
  layout: z.string(),
  square_m: z.number(),
  cols: z.number(),
  rows: z.number(),
  dugouts: z.object({ home: dugout, away: dugout }),
  sizes: z.object({ lo: sizeLo }),
});

export type StadiumMeta = z.infer<typeof stadiumMeta>;
export type DugoutSquares = StadiumMeta["dugouts"]["home"];
export type DugoutBox = keyof DugoutSquares;

export function parseStadiumMeta(value: unknown): StadiumMeta {
  return stadiumMeta.parse(value);
}

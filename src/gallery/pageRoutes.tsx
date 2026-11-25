import type { ReactNode } from "react";
import { GalleryRoutes } from "./GalleryRoutes";
import { seed, seedEverything } from "./cloudScenes";
import { type Group, type Row, rows, type Variant } from "./variant";

export const at = (path: string, own?: ReactNode) => (
  <GalleryRoutes path={path} own={own} />
);

export const routed = (path: string, own?: ReactNode) => () => at(path, own);

export const pages = (
  group: Group,
  section: string,
  list: readonly Row[]
): Variant[] =>
  rows(
    {
      group,
      section,
      stage: "page",
      prepare: group === "Competitions" ? seedEverything : seed,
      view: () => null,
    },
    list
  );

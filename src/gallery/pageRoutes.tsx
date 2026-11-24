import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { seed } from "./cloudScenes";
import { type Group, type Row, rows, type Variant } from "./variant";

interface Place {
  path: string;
  pattern: string;
  element: ReactNode;
}

export const at = ({ path, pattern, element }: Place) => (
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path={pattern} element={element} />
    </Routes>
  </MemoryRouter>
);

export const routed = (path: string, element: ReactNode) => () =>
  at({ path, pattern: path.split("?")[0] ?? path, element });

export const pages = (
  group: Group,
  section: string,
  list: readonly Row[]
): Variant[] =>
  rows(
    { group, section, stage: "page", prepare: seed, view: () => null },
    list
  );

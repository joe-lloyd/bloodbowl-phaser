import { FormationManager } from "../../src/game/managers/FormationManager";

export function renderSetupBaseline(isTeam1: boolean): string {
  const positions = new FormationManager().getDefaultFormation(isTeam1);
  const circles = positions
    .map(
      ({ x, y }) =>
        `  <circle cx="${String(x * 60 + 30)}" cy="${String(y * 60 + 30)}" r="21" fill="${
          isTeam1 ? "#cc2222" : "#2244cc"
        }" stroke="#ffffff" stroke-width="3"/>`
    )
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="660" viewBox="0 0 1200 660">
  <rect width="1200" height="660" fill="#2d5016"/>
  <rect width="1200" height="120" fill="#ffffff" fill-opacity=".08"/>
  <rect y="540" width="1200" height="120" fill="#ffffff" fill-opacity=".08"/>
  <path d="M420 0V660M780 0V660M0 120H1200M0 540H1200" stroke="#ffffff" stroke-width="3" fill="none"/>
  <path d="${Array.from(
    { length: 21 },
    (_, x) => `M${String(x * 60)} 0V660`
  ).join("")}${Array.from(
    { length: 12 },
    (_, y) => `M0 ${String(y * 60)}H1200`
  ).join("")}" stroke="#ffffff" stroke-opacity=".28" fill="none"/>
${circles}
</svg>`;
}

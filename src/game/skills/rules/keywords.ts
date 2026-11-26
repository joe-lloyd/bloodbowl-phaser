import { type Player } from "../../../types/Player";

function kind(text: string): string {
  return text.replaceAll(/[()]/g, "").trim().toLowerCase().replace(/s$/, "");
}

export function matchesKeyword(
  player: Player,
  parameter?: string | number
): boolean {
  if (parameter === undefined || parameter === null) return false;
  const kinds = String(parameter).split(",").map((element) => kind(element)).filter(Boolean);
  if (kinds.includes("all")) return true;
  const names = new Set([...(player.keywords ?? []), player.positionName].map((name) =>
    kind(name)
  ));
  return kinds.some((wanted) => names.has(wanted));
}

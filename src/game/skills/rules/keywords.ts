import { type Player } from "../../../types/Player";

function kind(text: string): string {
  return text.replace(/[()]/g, "").trim().toLowerCase().replace(/s$/, "");
}

export function matchesKeyword(
  player: Player,
  parameter?: string | number
): boolean {
  if (parameter === undefined || parameter === null) return false;
  const kinds = String(parameter).split(",").map(kind).filter(Boolean);
  if (kinds.includes("all")) return true;
  const names = [...(player.keywords ?? []), player.positionName].map((name) =>
    kind(String(name))
  );
  return kinds.some((wanted) => names.includes(wanted));
}

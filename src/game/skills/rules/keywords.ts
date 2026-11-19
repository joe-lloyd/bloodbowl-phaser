import { type Player } from "../../../types/Player";

export function matchesKeyword(
  player: Player,
  parameter?: string | number
): boolean {
  if (parameter === undefined || parameter === null) return false;
  const param = String(parameter).replace(/[()]/g, "").trim().toLowerCase();
  if (!param) return false;
  if (param === "all") return true;
  return (player.keywords ?? []).some((k) => String(k).toLowerCase() === param);
}

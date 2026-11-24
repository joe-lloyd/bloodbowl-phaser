import type { Queued } from "./diceTrayController";

export function diceTrayStage(
  current: Queued | null
): "landed" | "in-air" | "empty" {
  if (!current) return "empty";
  return current.settled ? "landed" : "in-air";
}

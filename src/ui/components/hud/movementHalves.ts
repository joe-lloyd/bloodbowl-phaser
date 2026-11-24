import type { MovementHalf } from "../../../types/events";
import type { Hotkey } from "../../hotkeys";

export const MOVEMENT_HALVES: Record<
  MovementHalf,
  { label: string; hotkey: Hotkey }
> = {
  jump: { label: "Jump", hotkey: "j" },
  standup: { label: "Stand Up", hotkey: "u" },
};

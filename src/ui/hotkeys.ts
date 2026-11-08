import { useEffect, useRef } from "react";
import { isTyping } from "../game/presentation/keyboardFocus";

/**
 * A key a button answers to, as `KeyboardEvent.key` names it, lower case for
 * letters: "m", "1", "Enter", "Escape". "shift+e" needs Shift held.
 */
export type Hotkey = string;

/** How a hotkey reads on its badge. */
export function hotkeyLabel(hotkey: Hotkey): string {
  return hotkey
    .split("+")
    .map((part) =>
      part === "shift"
        ? "⇧"
        : part === "Escape"
          ? "Esc"
          : part === "Enter"
            ? "↵"
            : part.toUpperCase()
    )
    .join("");
}

function hotkeyOf(event: KeyboardEvent): Hotkey {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return event.shiftKey && key.length === 1 ? `shift+${key}` : key;
}

/** Newest last: a dialog that opens over the action menu takes its keys. */
const bound: { hotkey: Hotkey; press: () => void }[] = [];

function onKeyDown(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
  if (isTyping(event.target)) return;
  const hotkey = hotkeyOf(event);
  const binding = [...bound]
    .reverse()
    .find((candidate) => candidate.hotkey === hotkey);
  if (!binding) return;
  // Before the board's own key handlers, so Escape in a dialog only
  // answers the dialog, and before a focused button takes Enter itself
  event.preventDefault();
  event.stopPropagation();
  binding.press();
}

/** Press `onPress` when `hotkey` goes down, while `enabled`. */
export function useHotkey(
  hotkey: Hotkey | undefined,
  onPress: () => void,
  enabled = true
): void {
  const press = useRef(onPress);
  press.current = onPress;
  useEffect(() => {
    if (!hotkey || !enabled) return;
    const binding = { hotkey, press: () => press.current() };
    if (bound.length === 0)
      window.addEventListener("keydown", onKeyDown, { capture: true });
    bound.push(binding);
    return () => {
      bound.splice(bound.indexOf(binding), 1);
      if (bound.length === 0)
        window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [hotkey, enabled]);
}

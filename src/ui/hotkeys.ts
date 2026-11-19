import type React from "react";
import { useEffect, useRef } from "react";
import { isTyping } from "../game/presentation/keyboardFocus";

export type Hotkey = string;

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

const bound: {
  hotkey: Hotkey;
  press: () => void;
  owner?: React.RefObject<HTMLElement | null>;
}[] = [];

function focusedInSameDialog(
  target: EventTarget | null,
  owner?: HTMLElement | null
) {
  const dialog = owner?.closest("[data-hotkey-scope]");
  return target instanceof HTMLButtonElement && !!dialog?.contains(target);
}

const onScreen = (owner?: HTMLElement | null) =>
  !owner || (owner.checkVisibility?.() ?? true);

function onKeyDown(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
  if (isTyping(event.target)) return;
  const hotkey = hotkeyOf(event);
  const binding = [...bound]
    .reverse()
    .find(
      (candidate) =>
        candidate.hotkey === hotkey && onScreen(candidate.owner?.current)
    );
  if (!binding) return;
  if (
    hotkey === "Enter" &&
    focusedInSameDialog(event.target, binding.owner?.current)
  )
    return;

  event.preventDefault();
  event.stopPropagation();
  binding.press();
}

export function useHotkey(
  hotkey: Hotkey | undefined,
  onPress: () => void,
  enabled = true,
  owner?: React.RefObject<HTMLElement | null>
): void {
  const press = useRef(onPress);
  press.current = onPress;
  useEffect(() => {
    if (!hotkey || !enabled) return;
    const binding = {
      hotkey,
      press: () => {
        press.current();
      },
      owner,
    };
    if (bound.length === 0)
      window.addEventListener("keydown", onKeyDown, { capture: true });
    bound.push(binding);
    return () => {
      bound.splice(bound.indexOf(binding), 1);
      if (bound.length === 0)
        window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [hotkey, enabled, owner]);
}

import React, { useEffect, useRef, useState } from "react";
import {
  MatchOptionsMenuActionEntry,
  MatchOptionsMenuEntry,
} from "./computeMatchOptionsMenu";
import { hudButtonClass } from "../componentWarehouse/HudKit";

interface MatchOptionsMenuProps {
  entries: MatchOptionsMenuEntry[];
  // Only ever invoked for action entries — panel entries manage their own
  // interaction internally and never call onSelect.
  onSelect: (id: MatchOptionsMenuActionEntry["id"]) => void;
}

/**
 * Bottom-right expandable match-options menu. Entries are supplied fully
 * computed (see matchOptionsMenu.ts) — this component only handles
 * disclosure, focus, keyboard navigation and the destructive-action confirm
 * step. Recomputing `entries` every render (rather than snapshotting at
 * open-time) is what lets enabled state track a live connection/ownership
 * change while the menu is open.
 */
export const MatchOptionsMenu: React.FC<MatchOptionsMenuProps> = ({
  entries,
  onSelect,
}) => {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] =
    useState<MatchOptionsMenuActionEntry | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus order is read straight from the live DOM rather than tracked in a
  // parallel ref array — that's what lets a panel entry's own interactive
  // children (the mute checkbox, the volume slider) join the same
  // Arrow-key/Tab cycle as the plain action rows without the menu needing
  // to know anything about what a panel renders.
  const getFocusable = (): HTMLElement[] => {
    if (!menuRef.current) return [];
    return Array.from(
      menuRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled])"
      )
    );
  };

  // A confirm target that vanished (context changed under us) can't stay
  // pending — fall back to the plain menu list.
  useEffect(() => {
    if (confirming && !entries.some((entry) => entry.id === confirming.id)) {
      setConfirming(null);
    }
  }, [entries, confirming]);

  useEffect(() => {
    if (!open) return;
    getFocusable()[0]?.focus();
  }, [open]);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
      setConfirming(null);
    };
    // Capture phase: the HUD stops presses from bubbling past its panels.
    document.addEventListener("mousedown", onDocPointerDown, true);
    return () =>
      document.removeEventListener("mousedown", onDocPointerDown, true);
  }, [open]);

  const close = () => {
    setOpen(false);
    setConfirming(null);
    triggerRef.current?.focus();
  };

  const selectEntry = (entry: MatchOptionsMenuActionEntry) => {
    if (entry.disabled) return;
    if (entry.confirm) {
      setConfirming(entry);
      return;
    }
    onSelect(entry.id);
    close();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Tab") {
      // The menu has no surrounding modal/dialog semantics to lean on, so
      // Tab is trapped by hand: while the menu (or its confirm step) is
      // open, Tab/Shift+Tab wraps within its own focusable elements rather
      // than leaking focus out to whatever's next/previous in the page.
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const currentIndex = focusable.indexOf(
        document.activeElement as HTMLElement
      );
      if (event.shiftKey) {
        if (currentIndex <= 0) {
          event.preventDefault();
          focusable[focusable.length - 1].focus();
        }
      } else if (currentIndex === -1 || currentIndex === focusable.length - 1) {
        event.preventDefault();
        focusable[0].focus();
      }
      return;
    }
    if (confirming) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // A focused <input type="range"> (the volume slider) already uses
      // Up/Down natively to change its own value — once Arrow-key
      // navigation has landed a coach there, those keys should adjust the
      // slider, not immediately bounce focus off it again. Tab still moves
      // on to the next focusable element.
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && active.type === "range") {
        return;
      }
      event.preventDefault();
      // Includes a panel entry's own interactive children (see
      // getFocusable), so Arrow keys can move focus into e.g. the mute
      // checkbox/volume slider, not just cycle past them.
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const currentIndex = focusable.indexOf(
        document.activeElement as HTMLElement
      );
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        (currentIndex + delta + focusable.length) % focusable.length;
      focusable[nextIndex]?.focus();
    }
  };

  return (
    <div
      className="flex flex-col items-end pointer-events-auto"
      onKeyDown={handleKeyDown}
      data-testid="match-options-menu-root"
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="match-options-menu"
        onClick={() => (open ? close() : setOpen(true))}
        className="hud-slab flex min-h-[40px] items-center gap-2 px-3.5 font-hud-label text-hud-base font-bold uppercase tracking-[0.08em] text-hud-bone transition-colors hover:border-hud-gold/70 hover:text-hud-gold aria-expanded:border-hud-gold aria-expanded:text-hud-gold"
      >
        ⚙ Match Options
      </button>

      {open && (
        <div
          id="match-options-menu"
          ref={menuRef}
          role="menu"
          aria-label="Match options"
          // In the stack's flow: the top-right stack scrolls, so a dropdown
          // laid over it was clipped to the trigger. In flow it also counts
          // as a HUD panel the camera keeps squares clear of.
          className="hud-slab mt-2 w-72 max-w-full p-2 animate-hud-in"
        >
          {confirming ? (
            <div
              role="alertdialog"
              aria-label={confirming.confirm!.title}
              className="flex flex-col gap-2 p-1"
            >
              <p className="font-hud-display text-hud-lg uppercase tracking-[0.03em] text-hud-bone">
                {confirming.confirm!.title}
              </p>
              <p className="text-hud-sm text-hud-bone/85">
                {confirming.confirm!.message}
              </p>
              <div className="mt-1 flex justify-end gap-2">
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={() => setConfirming(null)}
                  className={hudButtonClass("ghost", "sm")}
                >
                  {confirming.confirm!.cancelLabel}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const id = confirming.id;
                    close();
                    onSelect(id);
                  }}
                  className={hudButtonClass("primary", "sm")}
                >
                  {confirming.confirm!.confirmLabel}
                </button>
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {entries.map((entry) => {
                if (entry.type === "panel") {
                  return (
                    <li
                      key={entry.id}
                      className="mt-1 border-t border-white/10 px-2 pb-1 pt-2.5"
                    >
                      {entry.render()}
                    </li>
                  );
                }
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={entry.disabled}
                      aria-disabled={entry.disabled || undefined}
                      tabIndex={entry.disabled ? -1 : 0}
                      onClick={() => selectEntry(entry)}
                      className={`w-full rounded-hud border-l-[3px] px-2.5 py-2 text-left font-hud-label text-hud-base font-bold uppercase tracking-[0.05em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold ${
                        entry.disabled
                          ? "cursor-default border-transparent text-hud-mute"
                          : entry.destructive
                            ? "border-hud-bad/60 text-hud-bad-soft hover:bg-hud-blood-deep/50"
                            : "border-transparent text-hud-bone hover:border-hud-gold hover:bg-white/5"
                      }`}
                    >
                      <div>{entry.label}</div>
                      {entry.description && (
                        <div className="font-hud-body text-hud-xs font-normal normal-case tracking-normal text-hud-dim">
                          {entry.description}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

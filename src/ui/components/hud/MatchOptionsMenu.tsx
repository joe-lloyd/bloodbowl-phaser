import React, { useEffect, useRef, useState } from "react";
import {
  type MatchOptionsMenuActionEntry,
  type MatchOptionsMenuEntry,
} from "./computeMatchOptionsMenu";
import { hudButtonClass } from "../componentWarehouse/HudKit";
import { Title } from "../componentWarehouse/HudTitle";

interface MatchOptionsMenuProps {
  entries: MatchOptionsMenuEntry[];

  onSelect: (id: MatchOptionsMenuActionEntry["id"]) => void;

  compact?: boolean;
}

export const MatchOptionsMenu: React.FC<MatchOptionsMenuProps> = ({
  entries,
  onSelect,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<React.CSSProperties>();
  const [confirming, setConfirming] =
    useState<MatchOptionsMenuActionEntry | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const getFocusable = (): HTMLElement[] => {
    if (!menuRef.current) return [];
    return Array.from(
      menuRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled])"
      )
    );
  };

  useEffect(() => {
    if (confirming && entries.every((entry) => entry.id !== confirming.id)) {
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
    const onDocPointerDown = (event: PointerEvent) => {
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

    document.addEventListener("pointerdown", onDocPointerDown, {capture: true});
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
    };
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
      wrapTab(event, getFocusable());
      return;
    }
    if (confirming) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && active.type === "range") {
        return;
      }
      event.preventDefault();

      stepFocus(getFocusable(), event.key === "ArrowDown" ? 1 : -1);
    }
  };

  return (
    <div
      className="relative pointer-events-auto"
      onKeyDown={handleKeyDown}
      data-testid="match-options-menu-root"
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="match-options-menu"
        onClick={() => {
          if (open) {
            close();
            return;
          }

          const trigger = triggerRef.current!.getBoundingClientRect();
          setAnchor({
            top: trigger.bottom + 8,
            right: window.innerWidth - trigger.right,
          });
          setOpen(true);
        }}
        aria-label={compact ? "Match options" : undefined}
        className={
          compact
            ? "hud-slab flex h-11 w-11 items-center justify-center text-hud-lg text-hud-bone transition-colors aria-expanded:border-hud-gold aria-expanded:text-hud-gold"
            : "hud-slab flex min-h-[40px] items-center gap-2 px-3.5 font-hud-label text-hud-base font-bold uppercase tracking-[0.08em] text-hud-bone transition-colors hover:border-hud-gold/70 hover:text-hud-gold aria-expanded:border-hud-gold aria-expanded:text-hud-gold"
        }
      >
        {compact ? "⚙" : "⚙ Match Options"}
      </button>

      {open && (
        <div
          id="match-options-menu"
          ref={menuRef}
          role="menu"
          aria-label="Match options"
          className={
            compact
              ? "hud-slab absolute left-0 top-full z-50 mt-2 max-h-[calc(100dvh-5rem)] w-72 max-w-[70vw] overflow-y-auto p-2 animate-hud-in"
              : "hud-slab fixed z-50 max-h-[calc(100dvh-5rem)] w-72 overflow-y-auto p-2 animate-hud-in"
          }
          style={compact ? undefined : anchor}
        >
          {confirming ? (
            <div
              role="alertdialog"
              aria-label={confirming.confirm!.title}
              className="flex flex-col gap-2 p-1"
            >
              <Title level="section" as="p">
                {confirming.confirm!.title}
              </Title>
              <p className="text-hud-sm text-hud-bone/85">
                {confirming.confirm!.message}
              </p>
              <div className="mt-1 flex justify-end gap-2">
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={() => {
                    setConfirming(null);
                  }}
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
                      {...(entry.disabled === undefined
                        ? {}
                        : { disabled: entry.disabled })}
                      aria-disabled={entry.disabled || undefined}
                      tabIndex={entry.disabled ? -1 : 0}
                      onClick={() => {
                        selectEntry(entry);
                      }}
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

function wrapTab(event: React.KeyboardEvent, focusable: HTMLElement[]) {
  if (focusable.length === 0) return;
  const currentIndex = focusable.findIndex(
    (element) => element === document.activeElement
  );
  if (event.shiftKey) {
    if (currentIndex <= 0) {
      event.preventDefault();
      focusable.at(-1)?.focus();
    }
  } else if (currentIndex === -1 || currentIndex === focusable.length - 1) {
    event.preventDefault();
    focusable.at(0)?.focus();
  }
}

function stepFocus(focusable: HTMLElement[], delta: 1 | -1) {
  if (focusable.length === 0) return;
  const currentIndex = focusable.findIndex(
    (element) => element === document.activeElement
  );
  const nextIndex =
    (currentIndex + delta + focusable.length) % focusable.length;
  focusable[nextIndex]?.focus();
}

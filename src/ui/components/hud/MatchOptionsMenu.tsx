import React, { useEffect, useRef, useState } from "react";
import { MatchOptionsMenuEntry } from "./computeMatchOptionsMenu";

interface MatchOptionsMenuProps {
  entries: MatchOptionsMenuEntry[];
  onSelect: (id: MatchOptionsMenuEntry["id"]) => void;
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
  const [confirming, setConfirming] = useState<MatchOptionsMenuEntry | null>(
    null
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  itemRefs.current = new Array(entries.length).fill(null);

  // A confirm target that vanished (context changed under us) can't stay
  // pending — fall back to the plain menu list.
  useEffect(() => {
    if (confirming && !entries.some((entry) => entry.id === confirming.id)) {
      setConfirming(null);
    }
  }, [entries, confirming]);

  useEffect(() => {
    if (!open) return;
    const firstEnabled = itemRefs.current.find(Boolean);
    firstEnabled?.focus();
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
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    setConfirming(null);
    triggerRef.current?.focus();
  };

  const selectEntry = (entry: MatchOptionsMenuEntry) => {
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
    if (confirming) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const focusable = itemRefs.current.filter(
        (el): el is HTMLButtonElement => el != null
      );
      if (focusable.length === 0) return;
      const currentIndex = focusable.indexOf(
        document.activeElement as HTMLButtonElement
      );
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        (currentIndex + delta + focusable.length) % focusable.length;
      focusable[nextIndex]?.focus();
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
        onClick={() => (open ? close() : setOpen(true))}
        className="rounded border-2 border-bb-dark-gold bg-black/80 px-3 py-2 font-heading uppercase text-bb-gold shadow-xl hover:bg-black/95"
      >
        ⚙ Match Options
      </button>

      {open && (
        <div
          id="match-options-menu"
          ref={menuRef}
          role="menu"
          aria-label="Match options"
          className="absolute bottom-full right-0 z-50 mb-2 w-72 rounded border-2 border-bb-gold bg-slate-900/95 p-2 shadow-2xl"
        >
          {confirming ? (
            <div
              role="alertdialog"
              aria-label={confirming.confirm!.title}
              className="flex flex-col gap-2 p-1"
            >
              <p className="font-heading text-bb-gold">
                {confirming.confirm!.title}
              </p>
              <p className="text-sm text-gray-200">
                {confirming.confirm!.message}
              </p>
              <div className="mt-1 flex justify-end gap-2">
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={() => setConfirming(null)}
                  className="rounded border border-bb-gold px-3 py-1 text-sm text-bb-parchment hover:bg-slate-800"
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
                  className="rounded border border-red-500 bg-red-700 px-3 py-1 text-sm text-white hover:bg-red-600"
                >
                  {confirming.confirm!.confirmLabel}
                </button>
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {entries.map((entry, index) => (
                <li key={entry.id}>
                  <button
                    ref={(el) => {
                      if (!entry.disabled) itemRefs.current[index] = el;
                    }}
                    type="button"
                    role="menuitem"
                    disabled={entry.disabled}
                    aria-disabled={entry.disabled || undefined}
                    tabIndex={entry.disabled ? -1 : 0}
                    onClick={() => selectEntry(entry)}
                    className={`w-full rounded px-2 py-1.5 text-left text-sm font-heading transition-colors ${
                      entry.disabled
                        ? "cursor-default text-gray-400"
                        : entry.destructive
                          ? "text-red-300 hover:bg-red-900/60"
                          : "text-bb-parchment hover:bg-slate-800"
                    }`}
                  >
                    <div>{entry.label}</div>
                    {entry.description && (
                      <div className="text-xs font-body text-gray-400">
                        {entry.description}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

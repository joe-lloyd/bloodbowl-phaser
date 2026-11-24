import {
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { FormationEntry } from "../../../game/managers/FormationManager";
import { formationGroups } from "./formationGroups";
import { FormationThumb } from "./FormationThumb";

const COLUMNS = 3;

const GRID_WIDTH = 456;
const SCREEN_MARGIN = 16;
const PANEL_GAP = 24;

function besidePanel(panelLeft: number, screenWidth: number): CSSProperties {
  const width = Math.min(GRID_WIDTH, screenWidth - 2 * SCREEN_MARGIN);
  const left = Math.max(SCREEN_MARGIN, panelLeft - PANEL_GAP - width);
  return { left, width };
}

const KEY_STEP: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  Home: -Infinity,
  End: Infinity,
};

interface FormationPickerProps {
  formations: readonly FormationEntry[];
  selected: string;
  isTeam1: boolean;
  kicking: boolean;
  disabled: boolean;
  onPick: (name: string) => void;
}

export function FormationPicker(props: FormationPickerProps) {
  const { formations, selected, isTeam1, disabled } = props;
  const trigger = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<CSSProperties | null>(null);
  const current = formations.find((entry) => entry.name === selected);

  const close = () => {
    setAnchor(null);
    trigger.current?.focus();
  };
  const toggle = () => {
    if (anchor) {
      close();
      return;
    }
    const edge = trigger.current?.getBoundingClientRect().left ?? 0;
    setAnchor(besidePanel(edge, window.innerWidth));
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        data-testid="formation-menu"
        aria-haspopup="listbox"
        aria-expanded={anchor !== null}
        aria-label={`Setup: ${selected}. See all setups`}
        disabled={disabled}
        onClick={toggle}
        className="hud-field flex items-center gap-3 text-left hover:border-hud-gold/60 focus-visible:border-hud-gold disabled:opacity-50"
      >
        {current && (
          <FormationThumb
            positions={current.positions}
            isTeam1={isTeam1}
            className="h-12 w-16 shrink-0"
          />
        )}
        <span className="min-w-0 flex-1 truncate">{selected}</span>
        <span aria-hidden="true" className="text-hud-gold">
          ◂
        </span>
      </button>
      {anchor &&
        createPortal(
          <FormationGrid
            {...props}
            anchor={anchor}
            trigger={trigger}
            onClose={close}
          />,
          document.body
        )}
    </>
  );
}

function useOutsidePress(
  inside: readonly RefObject<HTMLElement | null>[],
  onPress: () => void
) {
  useEffect(() => {
    const check = ({ target }: PointerEvent) => {
      if (!(target instanceof Node)) return;
      if (inside.some((area) => area.current?.contains(target))) return;
      onPress();
    };
    document.addEventListener("pointerdown", check, true);
    window.addEventListener("resize", onPress);
    return () => {
      document.removeEventListener("pointerdown", check, true);
      window.removeEventListener("resize", onPress);
    };
  });
}

function FormationOption({
  entry,
  selected,
  isTeam1,
  onPick,
}: {
  entry: FormationEntry;
  selected: boolean;
  isTeam1: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onPick}
      className="flex min-w-0 flex-col items-center gap-1 rounded-hud border border-white/10 bg-black/35 p-1.5 hover:border-hud-gold/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold aria-selected:border-hud-gold"
    >
      <FormationThumb
        positions={entry.positions}
        isTeam1={isTeam1}
        className="h-[96px] w-full"
      />
      <span className="w-full truncate text-center font-hud-label text-hud-sm font-bold">
        {entry.name}
      </span>
    </button>
  );
}

const ROW_STEP: Readonly<Record<string, number>> = {
  ArrowDown: 1,
  ArrowUp: -1,
};

function rowsOf(all: readonly HTMLButtonElement[]): HTMLButtonElement[][] {
  const rows: HTMLButtonElement[][] = [];
  for (const option of all) {
    const row = rows.at(-1);
    const fits =
      row &&
      row.length < COLUMNS &&
      row[0]?.parentElement === option.parentElement;
    if (fits) row.push(option);
    else rows.push([option]);
  }
  return rows;
}

function besideRow(
  all: readonly HTMLButtonElement[],
  at: number,
  step: number
): HTMLButtonElement | undefined {
  const rows = rowsOf(all);
  const current = all[at];
  const index = rows.findIndex((row) => row.some((o) => o === current));
  const column = rows[index]?.findIndex((o) => o === current) ?? 0;
  const next = rows[index + step];
  return next?.[Math.min(column, next.length - 1)];
}

function navigate(
  event: KeyboardEvent,
  all: readonly HTMLButtonElement[],
  onClose: () => void
) {
  event.stopPropagation();
  if (event.key === "Escape" || event.key === "Tab") {
    event.preventDefault();
    onClose();
    return;
  }
  const at = all.findIndex((option) => option === document.activeElement);
  const rowStep = ROW_STEP[event.key];
  if (rowStep !== undefined) {
    event.preventDefault();
    besideRow(all, at, rowStep)?.focus();
    return;
  }
  const step = KEY_STEP[event.key];
  if (step === undefined) return;
  event.preventDefault();
  all[Math.min(all.length - 1, Math.max(0, at + step))]?.focus();
}

function FormationGrid({
  formations,
  selected,
  isTeam1,
  kicking,
  onPick,
  anchor,
  trigger,
  onClose,
}: FormationPickerProps & {
  anchor: CSSProperties;
  trigger: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const options = () => [
    ...(grid.current?.querySelectorAll<HTMLButtonElement>("[role=option]") ??
      []),
  ];

  useEffect(() => {
    const chosen = options().find((option) => option.ariaSelected === "true");
    (chosen ?? options()[0])?.focus();
  }, []);

  useOutsidePress([grid, trigger], onClose);

  return (
    <div
      ref={grid}
      role="listbox"
      aria-label="Setups"
      data-testid="formation-grid"
      data-hotkey-scope=""
      onKeyDown={(event) => { navigate(event, options(), onClose); }}
      style={anchor}
      className="hud-slab hud-scroll pointer-events-auto fixed bottom-4 z-[1001] max-h-[calc(100dvh-2rem)] space-y-3 overflow-y-auto border-t-[3px] border-t-hud-gold p-3 text-hud-bone animate-hud-in"
    >
      {formationGroups(formations, kicking).map((group) => (
        <div key={group.label} role="group" aria-label={group.label}>
          <div className="mb-1 font-hud-label text-hud-sm font-bold text-hud-dim">
            {group.label}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {group.entries.map((entry) => (
              <FormationOption
                key={entry.name}
                entry={entry}
                selected={entry.name === selected}
                isTeam1={isTeam1}
                onPick={() => {
                  onPick(entry.name);
                  onClose();
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

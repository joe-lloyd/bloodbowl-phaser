import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { PHONE_QUERY } from "../../../game/presentation/phoneLayout";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { RollShell } from "./RollShell";
import type { WeatherStep } from "./weatherThrow";

interface RollTableRow {
  label: string;
  name: string;
  detail: string;
}

export interface RollTablePanelProps {
  kind: "weather" | "kickoff";
  title: string;
  intro: string;
  columns: "grid-cols-5" | "grid-cols-6";
  rows: readonly RollTableRow[];
  result: RollTableRow | null;
  total: number | null;
  step: WeatherStep;
  stage: RefObject<HTMLDivElement | null>;
  header?: ReactNode;
  action: ReactNode;
  zClass: string;
}

const TEST_ID = {
  weather: { dialog: "weather-dialog", result: "weather-result" },
  kickoff: { dialog: "kickoff-table-dialog", result: "kickoff-table-result" },
} as const;

export function RollTablePanel(props: RollTablePanelProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  const { kind, title, intro, step, stage, result, total } = props;
  return (
    <RollShell
      testId={TEST_ID[kind].dialog}
      title={title}
      aside="2D6"
      zClass={props.zClass}
      width={kind === "kickoff" ? "w-[600px]" : "w-[480px]"}
      header={props.header}
      stage={stage}
      stageTestId="weather-stage"
      thrown={step !== "waiting"}
      action={props.action}
      table={phone ? <DialogRows {...props} /> : <StripCells {...props} />}
    >
      {step === "waiting" && <p className="text-hud-bone">{intro}</p>}
      {step === "rolling" && <p className="hud-label">Rolling…</p>}
      <ResultLine kind={kind} result={result} total={total} />
    </RollShell>
  );
}

function ResultLine({
  kind,
  result,
  total,
}: Pick<RollTablePanelProps, "kind" | "result" | "total">) {
  if (!result) return null;
  return (
    <div className="animate-hud-in" data-testid={TEST_ID[kind].result}>
      <div className="font-hud-display text-hud-2xl uppercase tracking-[0.02em] text-hud-gold">
        {result.name}
      </div>
      <p className="text-hud-dim">
        {total !== null && <>Rolled {total}. </>}
        {result.detail}
      </p>
    </div>
  );
}

function rowText(row: RollTableRow): string {
  return `${row.label} ${row.name}. ${row.detail}`;
}

function StripCells({ kind, columns, rows, result }: RollTablePanelProps) {
  const [peek, setPeek] = useState<RollTableRow | null>(null);
  const hint = peek ? rowText(peek) : "Point at a result to read what it does.";
  const clear = () => {
    setPeek(null);
  };
  return (
    <>
      <ul
        data-testid={`${kind}-table`}
        className={`mt-2 grid gap-1 ${columns}`}
        onMouseLeave={clear}
        onBlur={clear}
      >
        {rows.map((row) => (
          <StripCell
            key={row.label}
            row={row}
            hit={row.name === result?.name}
            onPeek={() => {
              setPeek(row);
            }}
          />
        ))}
      </ul>
      <div className="mt-2 grid font-hud-body text-hud-sm text-hud-dim">
        {rows.map((row) => (
          <span
            key={row.label}
            aria-hidden
            className="invisible [grid-area:1/1]"
          >
            {rowText(row)}
          </span>
        ))}
        <p
          className="[grid-area:1/1]"
          aria-live="polite"
          data-testid={`${kind}-table-detail`}
        >
          {hint}
        </p>
      </div>
    </>
  );
}

function StripCell({
  row,
  hit,
  onPeek,
}: {
  row: RollTableRow;
  hit: boolean;
  onPeek: () => void;
}) {
  return (
    <li data-current={hit ? "" : undefined} className="flex">
      <span
        tabIndex={0}
        onMouseEnter={onPeek}
        onFocus={onPeek}
        className={`flex min-h-[38px] w-full cursor-help items-center gap-1.5 rounded-hud border px-1.5 py-0.5 font-hud-label text-hud-sm font-bold uppercase leading-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold ${
          hit
            ? "border-hud-gold bg-hud-gold/20 text-hud-gold"
            : "border-white/10 text-hud-dim hover:border-hud-gold/60 hover:text-hud-bone"
        }`}
      >
        <span className="shrink-0 tabular-nums text-hud-bone">{row.label}</span>
        <span className="min-w-0 [overflow-wrap:anywhere]">{row.name}</span>
      </span>
    </li>
  );
}

function rowColumns(kind: RollTablePanelProps["kind"], rolled: boolean) {
  if (kind === "kickoff") return "grid-cols-2 landscape:grid-cols-3";
  return rolled ? "landscape:grid-cols-3" : "";
}

function DialogRows({ kind, rows, result }: RollTablePanelProps) {
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    list.current
      ?.querySelector("[data-current]")
      ?.scrollIntoView({ block: "nearest" });
  }, [result]);
  return (
    <ul
      ref={list}
      className={`grid gap-1 text-left ${rowColumns(kind, result !== null)}`}
      data-testid={`${kind}-table`}
    >
      {rows.map((row) => {
        const hit = row.name === result?.name;
        return (
          <li
            key={row.label}
            data-current={hit ? "" : undefined}
            className={`grid grid-cols-[2.5rem_1fr] items-baseline gap-2 rounded-hud border px-2 py-0.5 leading-tight ${
              hit
                ? "border-hud-gold bg-hud-gold/15 text-hud-bone"
                : "border-white/5 text-hud-dim"
            }`}
          >
            <span className="font-hud-label text-hud-base font-bold tabular-nums">
              {row.label}
            </span>
            <span>
              <span className="font-hud-label font-bold uppercase tracking-[0.04em]">
                {row.name}
              </span>
              {kind === "weather" && (
                <span
                  className={`ml-2 text-hud-xs ${result ? "landscape:hidden" : ""}`}
                >
                  {row.detail}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

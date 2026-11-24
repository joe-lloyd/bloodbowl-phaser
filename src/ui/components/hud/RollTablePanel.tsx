import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { PHONE_QUERY } from "../../../game/presentation/phoneLayout";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { DialogShell, Panel, PanelHeader } from "../componentWarehouse/HudKit";
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
  return phone ? <RollTableDialog {...props} /> : <RollTableStrip {...props} />;
}

function Stage({
  stage,
  step,
  className,
}: Pick<RollTablePanelProps, "stage" | "step"> & { className: string }) {
  return (
    <div
      ref={stage}
      data-testid="weather-stage"
      className={step === "waiting" ? "hidden" : className}
    />
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

function RollTableStrip(props: RollTablePanelProps) {
  const { kind, title, intro, step, stage, result, total } = props;
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4 ${props.zClass}`}
      data-testid={TEST_ID[kind].dialog}
      data-hotkey-scope=""
      data-hud-frame="bottom"
    >
      <Panel
        as="section"
        accent="gold"
        aria-label={title}
        className="pointer-events-auto w-[min(640px,calc(100vw-39rem))] min-w-[min(560px,100%)] animate-hud-in"
      >
        <PanelHeader title={title} as="h2" aside="2D6" />
        <div className="p-3">
          {props.header}
          <div className="flex min-h-[112px] items-center gap-4">
            <Stage
              stage={stage}
              step={step}
              className="h-[112px] w-[160px] shrink-0"
            />
            <div className="min-w-0 flex-1 font-hud-body text-hud-base">
              {step === "waiting" && <p className="text-hud-bone">{intro}</p>}
              {step === "rolling" && <p className="hud-label">Rolling…</p>}
              <ResultLine kind={kind} result={result} total={total} />
            </div>
            <div className="shrink-0 empty:hidden">{props.action}</div>
          </div>
          <StripCells {...props} />
        </div>
      </Panel>
    </div>
  );
}

function StripCells({ kind, columns, rows, result }: RollTablePanelProps) {
  const [peek, setPeek] = useState<RollTableRow | null>(null);
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
      <p
        className="mt-2 min-h-[18px] font-hud-body text-hud-sm text-hud-dim"
        aria-live="polite"
        data-testid={`${kind}-table-detail`}
      >
        {peek
          ? `${peek.label} ${peek.name}. ${peek.detail}`
          : "Point at a result to read what it does."}
      </p>
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

function RollTableDialog(props: RollTablePanelProps) {
  const { kind, title, intro, step, stage, result, total } = props;
  return (
    <DialogShell
      zClass={props.zClass}
      placement="center"
      backdrop="heavy"
      titleAs="h1"
      title={title}
      width={kind === "kickoff" ? "w-[600px]" : "w-[480px]"}
      className="text-center"
      testId={TEST_ID[kind].dialog}
    >
      {props.header}
      <div className="space-y-3 [@media(max-height:600px)]:space-y-1">
        {step === "waiting" && <p className="text-hud-dim">{intro}</p>}
        <Stage
          stage={stage}
          step={step}
          className="mx-auto h-[min(180px,28dvh)] w-full"
        />
        <ResultLine kind={kind} result={result} total={total} />
        <DialogRows {...props} />
        {props.action}
      </div>
    </DialogShell>
  );
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
      className={
        kind === "kickoff"
          ? "max-h-[min(360px,40dvh)] space-y-0.5 overflow-y-auto hud-scroll text-left"
          : "space-y-1 text-left"
      }
      data-testid={`${kind}-table`}
    >
      {rows.map((row) => {
        const hit = row.name === result?.name;
        return (
          <li
            key={row.label}
            data-current={hit ? "" : undefined}
            className={`grid grid-cols-[3.5rem_1fr] items-baseline gap-3 rounded-hud border px-3 py-0.5 ${
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
              <span className="ml-2 text-hud-xs">{row.detail}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

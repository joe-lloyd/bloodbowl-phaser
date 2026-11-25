import { useState, type ReactNode, type RefObject } from "react";
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
  rows: readonly RollTableRow[];
  result: RollTableRow | null;
  step: WeatherStep;
  thrown: boolean;
  stage: RefObject<HTMLDivElement | null>;
  header?: ReactNode;
  action: ReactNode;
  zClass: string;
}

const KIND = {
  weather: {
    dialog: "weather-dialog",
    result: "weather-result",
    columns: "grid-cols-5 phone:portrait:grid-cols-2",
  },
  kickoff: {
    dialog: "kickoff-table-dialog",
    result: "kickoff-table-result",
    columns: "grid-cols-6 phone:portrait:grid-cols-3",
  },
} as const;

export function RollTablePanel(props: RollTablePanelProps) {
  const [peek, setPeek] = useState<RollTableRow | null>(null);
  const { kind, title, intro, stage, result, rows } = props;
  return (
    <RollShell
      testId={KIND[kind].dialog}
      title={title}
      zClass={props.zClass}
      header={props.header}
      stage={stage}
      stageTestId="weather-stage"
      thrown={props.thrown}
      idle={<IdleDice />}
      action={props.action}
      table={
        <StripCells kind={kind} rows={rows} result={result} onPeek={setPeek} />
      }
    >
      <div className="grid [&>*]:[grid-area:1/1]">
        {rows.map((row) => (
          <div key={row.label} aria-hidden className="invisible">
            <RowText row={row} />
          </div>
        ))}
        <p aria-hidden className="invisible">
          {intro}
        </p>
        <Message {...props} peek={peek} />
      </div>
    </RollShell>
  );
}

function Message({
  kind,
  intro,
  step,
  result,
  peek,
}: RollTablePanelProps & { peek: RollTableRow | null }) {
  if (peek && peek !== result)
    return (
      <div data-testid={`${kind}-table-detail`}>
        <RowText row={peek} />
      </div>
    );
  if (result)
    return (
      <div className="text-hud-gold" data-testid={KIND[kind].result}>
        <RowText row={result} />
      </div>
    );
  return step === "waiting" ? <p className="text-hud-bone">{intro}</p> : null;
}

function RowText({ row }: { row: RollTableRow }) {
  return (
    <>
      <div className="font-hud-display text-hud-2xl uppercase tracking-[0.02em] phone:text-hud-xl">
        {row.name}
      </div>
      <p className="text-hud-dim">{row.detail}</p>
    </>
  );
}

function IdleDice() {
  return (
    <div aria-hidden className="flex gap-5">
      {["left", "right"].map((die) => (
        <span
          key={die}
          className="h-20 w-20 rounded-lg border-2 border-dashed border-white/15"
        />
      ))}
    </div>
  );
}

function StripCells({
  kind,
  rows,
  result,
  onPeek,
}: Pick<RollTablePanelProps, "kind" | "rows" | "result"> & {
  onPeek: (row: RollTableRow | null) => void;
}) {
  const clear = () => {
    onPeek(null);
  };
  return (
    <ul
      data-testid={`${kind}-table`}
      className={`mt-3 grid gap-1 phone:mt-2 ${KIND[kind].columns}`}
      onMouseLeave={clear}
      onBlur={clear}
    >
      {rows.map((row) => (
        <StripCell
          key={row.label}
          row={row}
          hit={row.name === result?.name}
          onPeek={() => {
            onPeek(row);
          }}
        />
      ))}
    </ul>
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

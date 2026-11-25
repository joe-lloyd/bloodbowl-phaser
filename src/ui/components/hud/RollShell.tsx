import type { ReactNode, RefObject } from "react";
import { WaitingLine } from "../componentWarehouse/HudBanner";
import { HudButton } from "../componentWarehouse/HudKit";
import { OpeningPanel } from "./OpeningPanel";

interface RollShellProps {
  testId: string;
  title: string;
  zClass: string;
  header?: ReactNode;
  stage: RefObject<HTMLDivElement | null>;
  stageTestId: string;
  thrown: boolean;
  idle?: ReactNode;
  action: ReactNode;
  table?: ReactNode;
  children: ReactNode;
}

export function RollShell(props: RollShellProps) {
  return (
    <OpeningPanel
      testId={props.testId}
      title={props.title}
      zClass={props.zClass}
    >
      {props.header}
      <div className="flex gap-4 phone:gap-3 phone:portrait:flex-col">
        <RollStage {...props} />
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 phone:gap-1">
          <div className="min-h-[96px] font-hud-body text-hud-base phone:text-hud-sm [overflow-wrap:anywhere]">
            {props.children}
          </div>
          <div
            className="flex min-h-[52px] flex-col justify-center"
            data-testid="roll-action"
          >
            {props.action}
          </div>
        </div>
      </div>
      {props.table}
    </OpeningPanel>
  );
}

function RollStage({
  stage,
  stageTestId,
  thrown,
  idle,
}: Pick<RollShellProps, "stage" | "stageTestId" | "thrown" | "idle">) {
  return (
    <div className="relative h-[176px] w-[240px] shrink-0 phone:h-[min(176px,36dvh)] phone:portrait:w-full">
      <div
        ref={stage}
        data-testid={stageTestId}
        className="absolute inset-0"
      />
      {!thrown && (
        <div className="absolute inset-0 grid place-items-center">{idle}</div>
      )}
    </div>
  );
}

export function RollBusy({ children }: { children: ReactNode }) {
  return (
    <HudButton variant="primary" size="lg" block disabled>
      {children}
    </HudButton>
  );
}

export function RollWait({ name }: { name: string }) {
  return <WaitingLine>Waiting for {name} to ready up…</WaitingLine>;
}

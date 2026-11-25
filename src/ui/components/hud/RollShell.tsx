import type { ReactNode, RefObject } from "react";
import { PHONE_QUERY } from "../../../game/presentation/phoneLayout";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { HudButton, Panel, PanelHeader } from "../componentWarehouse/HudKit";

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
  const phone = useMediaQuery(PHONE_QUERY);
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4 phone:pointer-events-auto phone:inset-0 phone:items-center phone:bg-black/40 phone:px-2 ${props.zClass}`}
      data-testid={props.testId}
      data-hotkey-scope=""
      data-hud-frame={phone ? undefined : "bottom"}
    >
      <Panel
        as="section"
        accent="gold"
        aria-label={props.title}
        className="pointer-events-auto w-[min(640px,calc(100vw-39rem))] min-w-[min(560px,100%)] animate-hud-in phone:max-h-[calc(100dvh-1rem)] phone:w-[640px] phone:min-w-0 phone:max-w-full phone:overflow-y-auto"
      >
        <PanelHeader title={props.title} as="h2" />
        <div className="p-3 phone:p-2">
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
        </div>
      </Panel>
    </div>
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
  return (
    <p className="line-clamp-2 font-hud-label text-hud-lg font-bold uppercase tracking-[0.06em] text-hud-dim">
      Waiting for {name} to ready up…
    </p>
  );
}

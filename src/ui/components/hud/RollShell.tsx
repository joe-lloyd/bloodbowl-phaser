import type { ReactNode, RefObject } from "react";
import { PHONE_QUERY } from "../../../game/presentation/phoneLayout";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { DialogShell, Panel, PanelHeader } from "../componentWarehouse/HudKit";

const STAGE = {
  strip: "h-[176px] w-[240px] shrink-0",
  dialog:
    "mx-auto h-[min(180px,32dvh)] w-full landscape:mx-0 landscape:w-[240px] landscape:shrink-0",
} as const;

interface RollShellProps {
  testId: string;
  title: string;
  aside: string;
  zClass: string;
  width: string;
  header?: ReactNode;
  stage: RefObject<HTMLDivElement | null>;
  stageTestId: string;
  thrown: boolean;
  waiting?: ReactNode;
  action: ReactNode;
  table?: ReactNode;
  children: ReactNode;
}

export function RollShell(props: RollShellProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  return phone ? <ShellDialog {...props} /> : <ShellStrip {...props} />;
}

function Stage({
  stage,
  stageTestId,
  thrown,
  waiting,
  shape,
}: Pick<RollShellProps, "stage" | "stageTestId" | "thrown" | "waiting"> & {
  shape: keyof typeof STAGE;
}) {
  return (
    <>
      {!thrown && waiting && (
        <div className={`${STAGE[shape]} grid place-items-center`}>
          {waiting}
        </div>
      )}
      <div
        ref={stage}
        data-testid={stageTestId}
        className={thrown ? STAGE[shape] : "hidden"}
      />
    </>
  );
}

function ShellStrip(props: RollShellProps) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4 ${props.zClass}`}
      data-testid={props.testId}
      data-hotkey-scope=""
      data-hud-frame="bottom"
    >
      <Panel
        as="section"
        accent="gold"
        aria-label={props.title}
        className="pointer-events-auto w-[min(640px,calc(100vw-39rem))] min-w-[min(560px,100%)] animate-hud-in"
      >
        <PanelHeader title={props.title} as="h2" aside={props.aside} />
        <div className="p-3">
          {props.header}
          <div className="flex min-h-[56px] items-center gap-4">
            <Stage {...props} shape="strip" />
            <div className="min-w-0 flex-1 font-hud-body text-hud-base">
              {props.children}
            </div>
            <div className="shrink-0 empty:hidden">{props.action}</div>
          </div>
          {props.table}
        </div>
      </Panel>
    </div>
  );
}

function ShellDialog(props: RollShellProps) {
  return (
    <DialogShell
      zClass={props.zClass}
      placement="center"
      backdrop="light"
      titleAs="h1"
      title={props.title}
      width={props.width}
      className="text-center"
      testId={props.testId}
    >
      {props.header}
      <div className="space-y-3 [@media(max-height:600px)]:space-y-1">
        <div className="landscape:flex landscape:items-center landscape:justify-center landscape:gap-4">
          <Stage {...props} shape="dialog" />
          <div>{props.children}</div>
        </div>
        {props.table}
        {props.action}
      </div>
    </DialogShell>
  );
}

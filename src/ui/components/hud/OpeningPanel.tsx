import type { ReactNode } from "react";
import { PHONE_QUERY } from "../../../game/presentation/phoneLayout";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { Panel, PanelHeader } from "../componentWarehouse/HudKit";

export function OpeningPanel({
  testId,
  title,
  zClass,
  footer,
  children,
}: {
  testId?: string;
  title: string;
  zClass: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const phone = useMediaQuery(PHONE_QUERY);
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4 phone:pointer-events-auto phone:inset-0 phone:items-center phone:bg-black/40 phone:px-2 ${zClass}`}
      data-testid={testId}
      data-hotkey-scope=""
      data-hud-frame={phone ? undefined : "bottom"}
    >
      <Panel
        as="section"
        accent="gold"
        aria-label={title}
        className="pointer-events-auto flex max-h-[min(560px,calc(100dvh-8rem))] w-[min(640px,calc(100vw-39rem))] min-w-[min(560px,100%)] flex-col animate-hud-in phone:max-h-[calc(100dvh-1rem)] phone:w-[640px] phone:min-w-0 phone:max-w-full"
      >
        <PanelHeader title={title} as="h2" />
        <div className="hud-scroll min-h-0 overflow-y-auto p-3 phone:p-2">
          {children}
        </div>
        {footer && (
          <div className="border-t border-hud-gold/20 p-3 phone:p-2">
            {footer}
          </div>
        )}
      </Panel>
    </div>
  );
}

import type { ReactNode, RefObject } from "react";
import { HudButton } from "../componentWarehouse/HudKit";
import { RollShell } from "./RollShell";

export function CoinTossPanel(props: {
  stage: RefObject<HTMLDivElement | null>;
  thrown: boolean;
  header?: ReactNode;
  idle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <RollShell
      {...props}
      testId="coin-dialog"
      title="Coin toss"
      zClass="z-[100]"
      stageTestId="coin-stage"
      action={props.action}
    >
      {props.children}
    </RollShell>
  );
}

export function TossWinner({ name, note }: { name: string; note: string }) {
  return (
    <div className="animate-hud-in">
      <div className="font-hud-display text-hud-xl uppercase tracking-[0.02em] text-hud-gold">
        {name} wins the toss!
      </div>
      <p className="mt-1 text-hud-dim">{note}</p>
    </div>
  );
}

export function KickOrReceive({
  onChoose,
}: {
  onChoose: (choice: "kick" | "receive") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <HudButton
        variant="secondary"
        size="lg"
        className="px-3"
        onClick={() => {
          onChoose("kick");
        }}
      >
        KICK
      </HudButton>
      <HudButton
        variant="secondary"
        size="lg"
        className="px-3"
        onClick={() => {
          onChoose("receive");
        }}
      >
        RECEIVE
      </HudButton>
    </div>
  );
}

import type { ReactNode, RefObject } from "react";
import { HudButton } from "../componentWarehouse/HudKit";
import { RollShell } from "./RollShell";

export function CoinTossPanel(props: {
  stage: RefObject<HTMLDivElement | null>;
  thrown: boolean;
  header?: ReactNode;
  waiting?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <RollShell
      {...props}
      testId="coin-dialog"
      title="Coin toss"
      aside="Heads or tails"
      zClass="z-[100]"
      width="w-[480px]"
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
      <div className="font-hud-display text-hud-2xl uppercase tracking-[0.02em] text-hud-gold">
        {name} wins the toss!
      </div>
      <p className="text-hud-dim">{note}</p>
    </div>
  );
}

export function KickOrReceive({
  onChoose,
}: {
  onChoose: (choice: "kick" | "receive") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 landscape:min-w-[130px] landscape:grid-cols-1 phone:landscape:grid-cols-2">
      <HudButton
        variant="gold"
        size="lg"
        onClick={() => {
          onChoose("kick");
        }}
      >
        KICK
      </HudButton>
      <HudButton
        variant="primary"
        size="lg"
        onClick={() => {
          onChoose("receive");
        }}
      >
        RECEIVE
      </HudButton>
    </div>
  );
}

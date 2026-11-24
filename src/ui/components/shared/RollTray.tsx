import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { DIE_LANDING_TIMEOUT_MS } from "../../../game/presentation/diceWatch";
import type { DiceTeam, DiceThrow } from "../../dice/diceScene";
import { soundSettings } from "../../sound/settings";
import type { RollThrow } from "./rollThrows";
import type { RollTrayState } from "./useRollTray";

const READ_MS = 900;

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function land(
  host: RefObject<HTMLDivElement | null>,
  team: DiceTeam,
  next: RollThrow
): Promise<DiceThrow | null> {
  try {
    const { playRoll } = await import("../../dice/diceScene");
    if (!host.current) return null;
    const { kind, values } = next;
    const handle = playRoll(
      host.current,
      { kind, values, team },
      { sound: !soundSettings.get().muted }
    );
    await Promise.race([handle.landed, pause(DIE_LANDING_TIMEOUT_MS)]);
    return handle;
  } catch (error) {
    console.warn("[RollTray] could not show the dice", error);
    return null;
  }
}

function RollTray({
  team,
  throws,
  onLanded,
}: {
  team: DiceTeam;
  throws: RollThrow[];
  onLanded: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [landed, setLanded] = useState(0);
  const onLandedRef = useRef(onLanded);

  useEffect(() => {
    let live = true;
    const isLive = () => live;
    let last: DiceThrow | null = null;
    const play = async () => {
      for (const [index, next] of throws.entries()) {
        last = await land(host, team, next);
        if (!isLive()) break;
        setLanded(index + 1);
        await pause(READ_MS);
        if (!isLive()) break;
      }
      if (isLive()) onLandedRef.current();
      else last?.stop();
    };
    void play();
    return () => {
      live = false;
      last?.stop();
    };
  }, [team, throws]);

  return (
    <div
      data-testid="roll-tray"
      data-dice={landed === throws.length ? "landed" : "in-air"}
      className="hud-slab mt-3 w-full max-w-[420px] overflow-hidden"
    >
      <ul className="min-h-[34px] space-y-1 border-b border-hud-gold/20 px-3 py-1.5 font-hud-label text-hud-sm font-semibold uppercase tracking-[0.05em] text-hud-bone">
        {throws.slice(0, landed + 1).map((next, index) => (
          <li key={next.title} className="flex justify-between gap-3">
            <span className="text-hud-dim">{next.title}</span>
            <span>{index < landed ? next.result : ""}</span>
          </li>
        ))}
      </ul>
      <div
        ref={host}
        className="h-[180px] w-full bg-[radial-gradient(ellipse_at_50%_85%,rgba(44,48,57,0.6),transparent_70%)]"
      />
    </div>
  );
}

export function RollStage({
  dice,
  children,
}: {
  dice: RollTrayState;
  children?: ReactNode;
}) {
  return (
    <>
      {dice.shown && (
        <RollTray
          key={dice.shown.id}
          team={dice.look}
          throws={dice.shown.throws}
          onLanded={dice.landed}
        />
      )}
      {!dice.rolling && children}
    </>
  );
}

import { useEffect, useRef, useState, type ReactNode } from "react";
import { DIE_LANDING_TIMEOUT_MS } from "../../../game/presentation/diceWatch";
import type { DiceTeam, DiceThrow } from "../../dice/diceScene";
import { soundSettings } from "../../sound/settings";
import type { RollThrow } from "./rollThrows";
import type { RollTrayState } from "./useRollTray";

const READ_MS = 900;
const BOX =
  "h-[180px] w-full bg-[radial-gradient(ellipse_at_50%_85%,rgba(44,48,57,0.6),transparent_70%)]";

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function land(
  host: HTMLDivElement | null,
  team: DiceTeam,
  next: RollThrow
): Promise<DiceThrow | null> {
  try {
    const { playRoll } = await import("../../dice/diceScene");
    if (!host) return null;
    const { kind, values } = next;
    const handle = playRoll(
      host,
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

interface LiveThrowProps {
  team: DiceTeam;
  next: RollThrow;
  onLanded: () => void;
  onRead: (still: string | null) => void;
}

function LiveThrow(props: LiveThrowProps) {
  const host = useRef<HTMLDivElement>(null);
  const [started] = useState(props);
  useEffect(() => {
    const controller = new AbortController();
    const stopped = () => controller.signal.aborted;
    const play = async () => {
      const handle = await land(host.current, started.team, started.next);
      if (!stopped()) started.onLanded();
      await pause(stopped() ? 0 : READ_MS);
      const still = handle?.still() ?? null;
      handle?.stop();
      if (!stopped()) started.onRead(still);
    };
    void play();
    return () => {
      controller.abort();
    };
  }, [started]);
  return <div ref={host} className={BOX} />;
}

function StillThrow({
  still,
  values,
}: {
  still: string | null;
  values: number[];
}) {
  if (still)
    return <img src={still} alt="" className={`${BOX} object-contain`} />;
  return (
    <div
      className={`${BOX} grid place-items-center font-hud-display text-hud-2xl`}
    >
      {values.join(", ")}
    </div>
  );
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
  const [landed, setLanded] = useState(0);
  const [stills, setStills] = useState<(string | null)[]>([]);
  return (
    <div
      data-testid="roll-tray"
      data-dice={landed === throws.length ? "landed" : "in-air"}
      className={`hud-slab mt-3 grid w-full overflow-hidden ${throws.length > 1 ? "max-w-[640px] sm:grid-cols-2" : "max-w-[420px]"}`}
    >
      {throws.slice(0, stills.length + 1).map((next, index) => (
        <div key={next.title} data-testid="roll-pair">
          <p className="flex min-h-[34px] items-center justify-between gap-3 border-b border-hud-gold/20 px-3 py-1.5 font-hud-label text-hud-sm font-semibold uppercase tracking-[0.05em] text-hud-bone">
            <span className="text-hud-dim">{next.title}</span>
            <span>{index < landed ? next.result : ""}</span>
          </p>
          {index < stills.length ? (
            <StillThrow still={stills[index] ?? null} values={next.values} />
          ) : (
            <LiveThrow
              team={team}
              next={next}
              onLanded={() => {
                setLanded(index + 1);
              }}
              onRead={(still) => {
                setStills((before) => [...before, still]);
                if (index === throws.length - 1) onLanded();
              }}
            />
          )}
        </div>
      ))}
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

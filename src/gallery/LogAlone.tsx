import { PHONE_QUERY } from "../game/presentation/phoneLayout";
import { DiceLog } from "../ui/components/hud/DiceLog";
import { HUDLayout } from "../ui/components/hud/HUDLayout";
import { useMediaQuery } from "../ui/hooks/useMediaQuery";
import type { MatchFixture } from "./fixtures";

export function LogAlone({ fx }: { fx: MatchFixture }) {
  const phone = useMediaQuery(PHONE_QUERY);
  const log = <DiceLog eventBus={fx.bus} />;
  return phone ? (
    <HUDLayout
      phone
      topLeft={
        <div className="h-[min(60dvh,420px)] w-full shrink-0">{log}</div>
      }
    />
  ) : (
    <HUDLayout
      bottomLeft={
        <div className="min-h-[160px] w-full flex-[0_1_50vh]">{log}</div>
      }
    />
  );
}

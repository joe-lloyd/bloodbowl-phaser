import { useSyncExternalStore } from "react";
import {
  canInstall,
  install,
  installsByHand,
  subscribeInstallOffer,
} from "../../../boundary/pwa";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { HudButton } from "../componentWarehouse/HudKit";

export function InstallGame() {
  const offered = useSyncExternalStore(subscribeInstallOffer, canInstall);
  const touch = useMediaQuery("(pointer: coarse)");
  if (!touch) return null;
  if (offered)
    return (
      <HudButton
        data-testid="install-game"
        variant="gold"
        className="mt-4"
        onClick={() => void install()}
      >
        Install the game
      </HudButton>
    );
  if (!installsByHand()) return null;
  return (
    <p
      data-testid="install-by-hand"
      className="mt-4 max-w-[320px] text-hud-sm text-hud-dim"
    >
      To play full screen, tap Share, then Add to Home Screen.
    </p>
  );
}

import { keepRosters } from "../../../boundary/offlineArt";
import {
  missingBytes,
  rosterReady,
  useOfflineArt,
  useOnline,
} from "../../hooks/useOfflineArt";
import { HudButton, Notice } from "../componentWarehouse/HudKit";

const MEGABYTE = 1_000_000;

export function OfflinePlayPanel({ rosters }: { rosters: readonly string[] }) {
  const art = useOfflineArt();
  const online = useOnline();
  if (!art.worker) return null;
  if (!online)
    return (
      <div className="mt-3 max-w-2xl" data-testid="offline-notice">
        <Notice tone="gold" role="status">
          You are offline. Teams whose art is not saved on this device are greyed out.
        </Notice>
      </div>
    );
  const missing = rosters.filter((roster) => !rosterReady(art, roster));
  const megabytes = Math.max(1, Math.round(missingBytes(art, missing) / MEGABYTE));
  return (
    <div
      className="mt-3 flex max-w-2xl flex-wrap items-center gap-3 text-hud-sm text-hud-dim"
      data-testid="offline-play"
    >
      <span>
        {art.progress
          ? `Saving art for offline play… ${String(Math.floor((art.progress.done / art.progress.total) * 100))}%`
          : `${String(rosters.length - missing.length)} of ${String(rosters.length)} rosters saved for offline play.`}
      </span>
      {missing.length > 0 && !art.progress && (
        <HudButton
          variant="ghost"
          onClick={() => {
            keepRosters(missing);
          }}
        >
          Save all ({megabytes} MB)
        </HudButton>
      )}
    </div>
  );
}

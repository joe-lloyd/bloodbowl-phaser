import { useEffect, useState } from "react";
import {
  heartbeat,
  type LobbyDoc,
  setLobbyListed,
} from "../../../firebase/lobby";
import { OPEN_GAME_HEARTBEAT_MS } from "../../../social/openGames";
import { errorText } from "../../errorText";
import { Notice, Section } from "../componentWarehouse/HudKit";

function warnHeartbeat(error: unknown): void {
  console.warn("[open lobby] could not mark the host present", error);
}

export function OpenLobbyToggle({
  lobby,
  uid,
}: {
  lobby: LobbyDoc;
  uid: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const listed = lobby.listed === true;
  const { code } = lobby;

  useEffect(() => {
    if (!listed) return;
    const beat = () => {
      heartbeat(code, uid).catch(warnHeartbeat);
    };
    beat();
    const id = setInterval(beat, OPEN_GAME_HEARTBEAT_MS);
    return () => {
      clearInterval(id);
    };
  }, [listed, code, uid]);

  return (
    <Section title="Who can join">
      <label className="flex items-start gap-3 font-hud-body text-hud-base text-hud-bone">
        <input
          type="checkbox"
          className="hud-check mt-0.5"
          checked={listed}
          onChange={(event) => {
            setError(null);
            setLobbyListed(code, event.target.checked).catch(
              (reason: unknown) => {
                setError(errorText(reason));
              }
            );
          }}
        />
        <span>
          Open game
          <span className="block text-hud-sm text-hud-dim">
            List this lobby under Join Game so any signed-in coach can take the
            empty seat. Leave it unticked to play only someone you give the
            code or invite.
          </span>
        </span>
      </label>
      {error && (
        <Notice tone="bad" role="alert" className="mt-3">
          {error}
        </Notice>
      )}
    </Section>
  );
}

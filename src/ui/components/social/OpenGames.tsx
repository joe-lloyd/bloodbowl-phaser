import { useEffect, useState } from "react";
import { Title } from "../componentWarehouse/HudTitle";
import { type LobbyDoc, subscribeOpenLobbies } from "../../../firebase/lobby";
import {
  OPEN_GAME_HEARTBEAT_MS,
  openGames,
  turnTimerLabel,
} from "../../../social/openGames";
import { useNow } from "../../hooks/useSocial";
import { HudButton } from "../componentWarehouse/HudKit";

export function OpenGames({
  uid,
  busy,
  onJoin,
}: {
  uid: string;
  busy: boolean;
  onJoin: (code: string) => void;
}) {
  const [lobbies, setLobbies] = useState<LobbyDoc[]>([]);
  const now = useNow(OPEN_GAME_HEARTBEAT_MS / 2);
  useEffect(() => subscribeOpenLobbies(setLobbies), []);
  const games = openGames({ lobbies, now, me: uid });

  return (
    <section className="w-full text-left" aria-label="Open games">
      <Title level="section" as="h2" className="mb-2">Open games</Title>
      {games.length === 0 ? (
        <p className="font-hud-body text-hud-sm text-hud-dim">
          Nobody is waiting in an open game right now. Host one and tick Open
          game so other coaches can find it.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {games.map((game) => (
            <li
              key={game.code}
              data-testid="open-game"
              data-code={game.code}
              className="flex flex-wrap items-center justify-between gap-3 rounded-hud border border-white/15 bg-black/30 px-3 py-2"
            >
              <span className="min-w-0">
                <Title level="row" as="span" className="block">
                  {game.hostName}
                </Title>
                <span className="block text-hud-sm text-hud-dim">
                  {game.teamName
                    ? `${game.teamName} (${String(game.rosterName)})`
                    : "Team not picked yet"}
                  {" · "}
                  {turnTimerLabel(game.turnSeconds)}
                </span>
              </span>
              <HudButton
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={() => {
                  onJoin(game.code);
                }}
              >
                Join
              </HudButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

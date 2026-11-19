import type { ConnectionState } from "../../firebase/lobby";
import type { IEventBus } from "../../services/EventBus";
import type { OnlineMatch } from "../../network/OnlineMatch";
import { WaitingBanner } from "./WaitingBanner";
import { Panel } from "../components/componentWarehouse/HudKit";

export function MatchBanner({
  match,
  eventBus,
  opponentName,
  connection,
}: {
  match: Pick<OnlineMatch, "mayAct" | "waitingLabel">;
  eventBus: IEventBus;
  opponentName: string;
  connection: ConnectionState;
}) {
  return connection === "online" ? (
    <WaitingBanner match={match} eventBus={eventBus} />
  ) : (
    <ConnectionBanner opponentName={opponentName} connection={connection} />
  );
}

export function ConnectionBanner({
  opponentName,
  connection,
}: {
  opponentName: string;
  connection: ConnectionState;
}) {
  let headline: string;
  let detail: string;
  switch (connection) {
    case "online":
      return null;
    case "offline":
      headline = "You are offline, reconnecting…";
      detail = "Your moves send once you are back.";
      break;
    case "slow":
      headline = "Connection slow";
      detail = "Moves may take a few seconds to arrive.";
      break;
    case "reconnecting":
      headline = `${opponentName} disconnected`;
      detail = "Waiting for them to reconnect…";
      break;
    case "abandonable":
      headline = `${opponentName} disconnected`;
      detail = "You can end the match from the Match Options menu.";
      break;
    default: {
      const exhaustive: never = connection;
      return exhaustive;
    }
  }
  return (
    <div className="absolute inset-x-0 top-[11.5rem] z-[93] flex justify-center pointer-events-none">
      <Panel
        accent="bad"
        data-testid="connection-banner"
        role="status"
        className="pointer-events-auto px-5 py-3 text-center animate-hud-in"
      >
        <p className="font-hud-label text-hud-lg font-bold uppercase tracking-[0.05em] text-hud-bad-soft">
          ⚠ {headline}
        </p>
        <p className="mt-1 font-hud-body text-hud-sm text-hud-dim">{detail}</p>
      </Panel>
    </div>
  );
}

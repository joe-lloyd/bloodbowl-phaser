import type { ConnectionState } from "../../firebase/lobby";
import type { IEventBus } from "../../services/EventBus";
import type { OnlineMatch } from "../../network/OnlineMatch";
import { WaitingBanner } from "./WaitingBanner";
import { PitchNotice } from "../components/componentWarehouse/HudBanner";

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
      <PitchNotice
        tone="bad"
        data-testid="connection-banner"
        role="status"
        detail={detail}
        className="pointer-events-auto"
      >
        ⚠ {headline}
      </PitchNotice>
    </div>
  );
}

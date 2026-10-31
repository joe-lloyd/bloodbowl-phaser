import type { ConnectionState } from "../../firebase/lobby";

/**
 * The match's connection, when it is not simply up. This coach's own drop
 * comes first: offline, they are told so and offered nothing against the
 * other coach. Otherwise the other coach's stale heartbeat shows as
 * "reconnecting", and after a longer grace the options menu's "End Match
 * (Opponent Left)" entry becomes available.
 */
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
    <div className="absolute inset-x-0 top-[15rem] z-[93] flex justify-center pointer-events-none">
      <div
        data-testid="connection-banner"
        role="status"
        className="hud-slab pointer-events-auto border-t-[3px] border-t-hud-bad px-5 py-3 text-center animate-hud-in"
      >
        <p className="font-hud-label text-hud-lg font-bold uppercase tracking-[0.05em] text-[#ff8a8a]">
          ⚠ {headline}
        </p>
        <p className="mt-1 font-hud-body text-hud-sm text-hud-dim">{detail}</p>
      </div>
    </div>
  );
}

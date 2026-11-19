import { type Team } from "../../../types/Team";
import { sppValuesFor } from "../../../game/progression/MatchStats";
import { hudButtonClass } from "../componentWarehouse/HudKit";

interface Props {
  team: Team;
  eligibleIds: string[];
  nominees: string[];

  mvpResult: { playerId: string; roll: number } | undefined;
  touchdownRecipient: string | undefined;
  onToggleNominee: (playerId: string) => void;
  onRollMvp: () => void;
  onChooseTouchdownRecipient: (playerId: string) => void;
  onAssignTouchdown: () => void;
}

export function MvpAwardCard({
  team,
  eligibleIds,
  nominees,
  mvpResult,
  touchdownRecipient,
  onToggleNominee,
  onRollMvp,
  onChooseTouchdownRecipient,
  onAssignTouchdown,
}: Props) {
  return (
    <section className="rounded-hud border border-white/10 bg-black/30 p-4">
      <h2 className="font-hud-display text-hud-xl uppercase tracking-[0.03em] text-hud-gold">
        {team.name} MVP
      </h2>
      <p className="mb-3 text-hud-sm text-hud-dim">
        Nominate six players who took part. Their displayed order is slots 1–6.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {eligibleIds.map((playerId) => {
          const player = team.players.find(
            (candidate) => candidate.id === playerId
          )!;
          const slot = nominees.indexOf(playerId);
          return (
            <button
              key={playerId}
              disabled={!!mvpResult}
              onClick={() => {
                onToggleNominee(playerId);
              }}
              className={`min-h-[40px] rounded-hud border px-3 py-2 text-left font-hud-label text-hud-base font-bold transition-colors disabled:cursor-default ${
                slot >= 0
                  ? "border-hud-gold bg-hud-blood text-white"
                  : "border-white/10 bg-hud-raise text-hud-bone hover:border-hud-gold/60"
              }`}
            >
              {slot >= 0 ? `${String(slot + 1)}. ` : ""}#{player.number}{" "}
              {player.playerName}
            </button>
          );
        })}
      </div>
      {mvpResult ? (
        <p className="mt-3 font-hud-label text-hud-xl font-bold uppercase text-hud-gold">
          {mvpResult.roll >= 1 ? `Rolled ${String(mvpResult.roll)}: ` : ""}
          {
            team.players.find((player) => player.id === mvpResult.playerId)
              ?.playerName
          }{" "}
          gains 4 SPP
        </p>
      ) : (
        <button
          onClick={onRollMvp}
          disabled={nominees.length !== Math.min(6, eligibleIds.length)}
          className={`${hudButtonClass("primary", "lg")} mt-4`}
        >
          Roll MVP D6
        </button>
      )}
      <div className="mt-5 border-t border-white/10 pt-4">
        <p className="mb-2 text-hud-sm text-hud-dim">
          If this team was awarded a touchdown after a concession, assign its{" "}
          {sppValuesFor(team.rosterName).touchdown} SPP here. Repeat for each
          awarded touchdown.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            aria-label={`${team.name} awarded touchdown recipient`}
            value={touchdownRecipient ?? ""}
            onChange={(event) => {
              onChooseTouchdownRecipient(event.target.value);
            }}
            className="hud-field min-w-0 flex-1"
          >
            <option value="">Choose a player</option>
            {team.players
              .filter((player) => player.playerKind !== "star")
              .map((player) => (
                <option key={player.id} value={player.id}>
                  #{player.number} {player.playerName}
                </option>
              ))}
          </select>
          <button
            disabled={!touchdownRecipient}
            onClick={onAssignTouchdown}
            className={hudButtonClass("secondary")}
          >
            Assign touchdown
          </button>
        </div>
      </div>
    </section>
  );
}

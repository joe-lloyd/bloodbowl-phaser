import type { Player } from "../../../types/Player";
import type { Team } from "../../../types/Team";
import { GAME_TYPE_LABELS } from "../../../game/variants/gameTypes";
import type { ClubEntry } from "../../../game/rules/clubEntries";
import { appearanceOf } from "../../../game/names/playerIdentity";
import { Chip, Panel } from "../componentWarehouse/HudKit";
import { PlayerPortrait } from "../common/PlayerPortrait";

function playerLabel(player: Player): string {
  return `#${String(player.number)} ${player.playerName} · ${player.positionName}${player.veteran ? " (Veteran)" : ""}`;
}

function Squad({ team, players }: { team: Team; players: Player[] }) {
  return (
    <ul className="grid grid-cols-6 gap-1" aria-label="Squad">
      {players.map((player) => (
        <li key={player.id} title={playerLabel(player)}>
          <PlayerPortrait
            rosterName={team.rosterName}
            positionName={player.positionName}
            colors={team.colors}
            appearance={appearanceOf(player, team.rosterName)}
            size={36}
          />
        </li>
      ))}
    </ul>
  );
}

function StaysHome({ entry }: { entry: ClubEntry }) {
  const names = [
    ...entry.home.map((player) => `${player.playerName} (${player.positionName})`),
    ...entry.staffHome,
  ];
  if (names.length === 0) return null;
  return (
    <p className="font-hud-body text-hud-sm text-hud-dim">
      Stays home: {names.join(", ")}
    </p>
  );
}

export function ClubEntryCard({
  team,
  entry,
}: {
  team: Team;
  entry: ClubEntry;
}) {
  const ready = entry.problems.length === 0;
  return (
    <Panel as="section" className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-hud-display text-hud-lg uppercase tracking-[0.04em] text-hud-bone">
          {GAME_TYPE_LABELS[entry.gameType]}
        </h3>
        <Chip tone={ready ? "good" : "warn"}>
          {ready ? "Ready" : "Not yet"}
        </Chip>
      </div>
      <span className="hud-label">{entry.squad.length} players</span>
      <Squad team={team} players={entry.squad} />
      <StaysHome entry={entry} />
      {entry.problems.map((problem) => (
        <p key={problem} className="font-hud-body text-hud-sm text-hud-warn">
          {problem}
        </p>
      ))}
    </Panel>
  );
}

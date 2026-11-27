import type { Player } from "../../../types/Player";
import type { Team } from "../../../types/Team";
import { getRosterByRosterName } from "../../../data/RosterTemplates";
import {
  clubPlayers,
  followSevens,
  setSquadMember,
  squadFollowsSevens,
  squadIds,
} from "../../../game/rules/club";
import { isLinemanPosition, validateRosterLegality } from "../../../game/rules/rosterLegality";
import { GAME_TYPE_LABELS, type GameType } from "../../../game/variants/gameTypes";
import { Chip, HudButton, Section } from "../componentWarehouse/HudKit";

const SQUAD_TYPES: readonly GameType[] = [
  "sevens",
  "street-bowl",
  "beach-bowl",
  "gutter-bowl",
];

type Change = (team: Team) => void;

function changed(team: Team, apply: (copy: Team) => void): Team {
  const copy = { ...team, ...(team.club && { club: { ...team.club } }) };
  apply(copy);
  return copy;
}

function SquadHeading({ team, gameType, onChange }: { team: Team; gameType: GameType; onChange: Change }) {
  const follows = squadFollowsSevens(team, gameType);
  return (
    <th className="text-center">
      <span className="block">{GAME_TYPE_LABELS[gameType]}</span>
      {gameType !== "sevens" && follows && (
        <span className="block font-hud-body text-hud-sm normal-case text-hud-mute">Same as Sevens</span>
      )}
      {gameType !== "sevens" && !follows && (
        <HudButton
          size="xs"
          variant="ghost"
          className="mt-1"
          onClick={() => {
            onChange(changed(team, (copy) => { followSevens(copy, gameType); }));
          }}
        >
          Use Sevens
        </HudButton>
      )}
    </th>
  );
}

function SquadStatus({ team, gameType }: { team: Team; gameType: GameType }) {
  const problems = validateRosterLegality(
    team,
    getRosterByRosterName(team.rosterName),
    gameType
  ).map((violation) => violation.detail);
  return (
    <td className="align-top">
      <span className="hud-label block">{squadIds(team, gameType).length} players</span>
      {problems.length === 0 ? (
        <Chip tone="good">Ready</Chip>
      ) : (
        <ul className="font-hud-body text-hud-sm text-hud-warn">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
    </td>
  );
}

function PlayerRow({ team, player, onChange }: { team: Team; player: Player; onChange: Change }) {
  return (
    <tr data-testid={`squad-row-${String(player.number)}`}>
      <td className="num text-hud-mute">{player.number}</td>
      <td>{player.playerName}</td>
      <td>
        {player.positionName}
        {!isLinemanPosition(player.keywords) && (
          <span className="ml-2 text-hud-sm text-hud-dim">positional</span>
        )}
      </td>
      {SQUAD_TYPES.map((gameType) => (
        <td key={gameType} className="text-center">
          <input
            type="checkbox"
            className="hud-check"
            aria-label={`${player.playerName} plays ${GAME_TYPE_LABELS[gameType]}`}
            checked={squadIds(team, gameType).includes(player.id)}
            onChange={(event) => {
              const plays = event.target.checked;
              onChange(changed(team, (copy) => {
                setSquadMember(copy, gameType, { playerId: player.id, plays });
              }));
            }}
          />
        </td>
      ))}
    </tr>
  );
}

export function SquadGrid({ team, onChange }: { team: Team; onChange: Change }) {
  const players = [...clubPlayers(team)].sort((a, b) => a.number - b.number);
  return (
    <Section title="Squads" bodyClassName="overflow-x-auto">
      <p className="mb-3 font-hud-body text-hud-sm text-hud-dim">
        Tick who plays each game type. Every game type uses the Sevens squad
        until you change its column. Each squad must be legal for its own game
        type.
      </p>
      <table className="hud-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Position</th>
            {SQUAD_TYPES.map((gameType) => (
              <SquadHeading key={gameType} team={team} gameType={gameType} onChange={onChange} />
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <PlayerRow key={player.id} team={team} player={player} onChange={onChange} />
          ))}
          <tr>
            <td colSpan={3} className="hud-label">Squad</td>
            {SQUAD_TYPES.map((gameType) => (
              <SquadStatus key={gameType} team={team} gameType={gameType} />
            ))}
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

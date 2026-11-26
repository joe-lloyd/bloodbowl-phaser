import type { Player, PlayerTemplate } from "../../../types/Player";
import type { Team } from "../../../types/Team";
import { getRosterByRosterName } from "../../../data/RosterTemplates";
import { isLinemanPosition } from "../../../game/rules/rosterLegality";
import { nextFreeNumber } from "../../../game/rules/leagueRoster";
import { ROSTER_SLOTS } from "../../../game/rules/playerSlots";
import {
  corePlayers,
  gutterSitsOut,
  gutterSpecialist,
  gutterSpecialistRefusal,
  gutterUnlocked,
  isGutterSpecialist,
  thousands,
} from "../../../game/rules/club";
import { Chip, HudButton } from "../componentWarehouse/HudKit";
import { GutterProgress } from "./GutterProgress";

const SITS_OUT_HINT =
  "The Core Sevens squad is full, so this Lineman sits out Gutter Bowl to make room for the specialist.";

function SpecialistHires({
  team,
  onHire,
}: {
  team: Team;
  onHire: (template: PlayerTemplate) => void;
}) {
  const positionals = getRosterByRosterName(
    team.rosterName
  ).playerTemplates.filter(
    (template) => !isLinemanPosition(template.keywords)
  );
  return (
    <div className="flex flex-wrap gap-2">
      {positionals.map((template) => {
        const refusal = gutterSpecialistRefusal(team, template);
        return (
          <HudButton
            key={template.positionName}
            size="sm"
            disabled={refusal !== undefined}
            title={refusal}
            onClick={() => {
              onHire(template);
            }}
          >
            Hire {template.positionName} · {thousands(template.cost)}
          </HudButton>
        );
      })}
    </div>
  );
}

export function GutterSlotRow({
  team,
  onHire,
}: {
  team: Team;
  onHire?: ((template: PlayerTemplate) => void) | undefined;
}) {
  if (!team.club || gutterSpecialist(team)) return null;
  const open = gutterUnlocked(team);
  return (
    <tr data-testid="gutter-slot">
      <td className="num select-none font-hud-label font-bold text-hud-mute">
        {nextFreeNumber(team, ROSTER_SLOTS + 1)}
      </td>
      <td colSpan={17}>
        <div className="flex flex-col gap-2 py-1">
          <span className="hud-label text-hud-gold">
            Gutter Bowl specialist
          </span>
          <span className="font-hud-body text-hud-sm text-hud-dim">
            A fifth positional, paid from the treasury, who plays only Gutter
            Bowl. With eleven in the squad, one Lineman sits out Gutter Bowl
            for them.
          </span>
          {open && onHire ? (
            <SpecialistHires team={team} onHire={onHire} />
          ) : (
            <span className="max-w-md">
              <GutterProgress team={team} />
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

function SitsOutChoice({
  team,
  sitsOut,
  onChoose,
}: {
  team: Team;
  sitsOut: Player;
  onChoose: (playerId: string) => void;
}) {
  const linemen = corePlayers(team).filter((player) =>
    isLinemanPosition(player.keywords)
  );
  return (
    <label className="flex items-center gap-2 font-hud-body text-hud-sm text-hud-dim">
      Replaces
      <select
        className="hud-field !w-auto !py-1 text-hud-sm"
        aria-label="Lineman who sits out Gutter Bowl"
        title={SITS_OUT_HINT}
        value={sitsOut.id}
        onChange={(event) => {
          onChoose(event.target.value);
        }}
      >
        {linemen.map((player) => (
          <option key={player.id} value={player.id}>
            #{player.number} {player.playerName}
            {player.veteran ? " (Veteran)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ClubBadges({
  team,
  player,
  onChooseSitsOut,
}: {
  team: Team;
  player: Player;
  onChooseSitsOut?: ((playerId: string) => void) | undefined;
}) {
  if (!team.club) return null;
  const sitsOut = gutterSitsOut(team);
  if (sitsOut?.id === player.id)
    return (
      <Chip tone="warn" title={SITS_OUT_HINT}>
        Sits out Gutter Bowl
      </Chip>
    );
  if (!isGutterSpecialist(team, player)) return null;
  return (
    <>
      <Chip tone="info" title="Plays only Gutter Bowl">
        Gutter Bowl only
      </Chip>
      {sitsOut && onChooseSitsOut && (
        <SitsOutChoice team={team} sitsOut={sitsOut} onChoose={onChooseSitsOut} />
      )}
    </>
  );
}

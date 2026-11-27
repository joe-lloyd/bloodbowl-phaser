import { STAT_HEADERS } from "./statHeaders";
import { useNavigate } from "react-router-dom";
import {
  calculateTeamValue,
  isPendingRecruit,
  playerValue,
  playersTeamValue,
  playsNextGame,
  staffTeamValue,
  type Team,
} from "../../../types/Team";
import {
  InjuryType,
  type Player,
  type PlayerTemplate,
  PlayerStatus,
} from "../../../types/Player";
import { canAdvance, mustAdvance } from "../../../game/progression/progression";
import { BloodBowlTable } from "../componentWarehouse/BloodBowlTable";
import { Chip, hudButtonClass } from "../componentWarehouse/HudKit";
import { numToHex } from "../TeamManagement/TeamStatsOverview";
import { SkillList, StatCells } from "./AvailableHires";
import { isLinemanPosition } from "../../../game/rules/rosterLegality";
import { mayCaptain } from "../../../game/rules/teamCaptain";
import { PlayerPortrait } from "../common/PlayerPortrait";
import { appearanceOf } from "../../../game/names/playerIdentity";
import { isGutterSpecialist } from "../../../game/rules/club";
import { ClubBadges, GutterSlotRow } from "../club/ClubRosterRows";

interface TeamRosterProps {
  team: Team;
  onFirePlayer: (playerId: string) => void;
  onReorderPlayers: (sourceSlot: number, targetSlot: number) => void;

  onChooseVeteran?: ((playerId: string) => void) | undefined;

  onChooseTeamCaptain?: ((playerId: string) => void) | undefined;

  onOpenPlayer?: (playerId: string) => void;

  onHireSpecialist?: ((template: PlayerTemplate) => void) | undefined;

  onChooseSitsOut?: ((playerId: string) => void) | undefined;
}

function isRowControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("button, a, input, select, textarea, [data-drag-handle]") !==
      null
  );
}

function notInTeamValueReason(team: Team, player: Player): string {
  if (isPendingRecruit(team, player.id)) return "Not hired yet";
  if (
    player.status === PlayerStatus.DEAD ||
    player.injuries.includes(InjuryType.DEAD)
  ) {
    return "Dead";
  }
  if (player.injuries.includes(InjuryType.MISS_NEXT_GAME)) {
    return "Misses the next game";
  }
  return "Injured";
}

function rosterSlots(team: Team): number[] {
  const extra = team.players
    .map((player) => player.number)
    .filter((number) => number > 11)
    .sort((a, b) => a - b);
  return [
    ...Array.from({ length: 11 }, (_, index) => index + 1),
    ...new Set(extra),
  ];
}

export function TeamRoster({
  team,
  onFirePlayer,
  onReorderPlayers,
  onChooseVeteran,
  onChooseTeamCaptain,
  onOpenPlayer,
  onHireSpecialist,
  onChooseSitsOut,
}: TeamRosterProps) {
  const navigate = useNavigate();
  const openPlayer =
    onOpenPlayer ??
    ((playerId: string) =>
      navigate(`/build-team/${team.id}/player/${playerId}`));

  return (
    <BloodBowlTable
      title={team.name.toUpperCase()}
      aside={`${String(team.players.filter((player) => !isGutterSpecialist(team, player)).length)} / 11 players`}
      accent={{ color: numToHex(team.colors.primary) }}
      headers={[
        { label: "#", width: "40px", className: "num" },
        { label: "Name", width: "22%" },
        { label: "Position", width: "15%" },
        ...STAT_HEADERS,
        { label: "Skills", width: "15%" },
        { label: "SPP", className: "num" },
        { label: "Value", className: "num" },
        { label: "GP", className: "num" },
        { label: "TD", className: "num" },
        { label: "CMP", className: "num" },
        { label: "CAS", className: "num" },
        { label: "Kills", className: "num" },
        { label: "MVP", className: "num" },
        { label: "", width: "64px" },
      ]}
    >
      {rosterSlots(team).map((slotNumber) => {
        const player = team.players.find((p) => p.number === slotNumber);

        return (
          <tr
            key={slotNumber}
            data-testid={`roster-row-${String(slotNumber)}`}
            className={
              player ? "cursor-pointer transition-colors hover:bg-white/5" : ""
            }
            title={player ? "Open player details" : undefined}
            onClick={(e) => {
              if (!player || isRowControl(e.target)) return;

              if (getSelection()?.toString()) return;
              openPlayer(player.id);
            }}
            onDragEnter={(e) => {
              e.preventDefault();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const sourceSlotString = e.dataTransfer.getData("text/plain");
              const sourceSlot = parseInt(sourceSlotString);

              if (Number.isNaN(sourceSlot) || sourceSlot === slotNumber) return;
              onReorderPlayers(sourceSlot, slotNumber);
            }}
          >
            <td className="num select-none font-hud-label font-bold text-hud-mute">
              {slotNumber}
            </td>

            {player ? (
              <>
                <td className="text-hud-base">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <button
                      className="rounded-hud text-left font-hud-label font-bold uppercase tracking-[0.03em] text-hud-bone hover:text-hud-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold"
                      onClick={() => {
                        openPlayer(player.id);
                      }}
                      title="View player development page"
                    >
                      {player.playerName}
                    </button>
                    <PlayerBadges
                      player={player}
                      onChooseVeteran={onChooseVeteran}
                      onChooseTeamCaptain={onChooseTeamCaptain}
                    />
                    <ClubBadges
                      team={team}
                      player={player}
                      onChooseSitsOut={onChooseSitsOut}
                    />
                  </div>
                </td>
                <td>
                  <span className="flex items-center gap-2 text-hud-sm text-hud-bone">
                    <PlayerPortrait
                      rosterName={team.rosterName}
                      positionName={player.positionName}
                      colors={team.colors}
                      appearance={appearanceOf(player, team.rosterName)}
                      size={40}
                    />
                    {player.positionName}
                  </span>
                </td>
                <StatCells stats={player.stats} />
                <td>
                  <SkillList skills={player.skills} />
                </td>
                <td
                  className={player.spp ? "num" : "num text-hud-mute"}
                  data-testid="player-spp"
                  title="Star Player Points"
                >
                  {player.spp}
                </td>
                <ValueCell team={team} player={player} />
                <CareerCells player={player} />
                <td>
                  <div className="flex items-center justify-end gap-1">
                    <span
                      data-drag-handle
                      data-testid="drag-handle"
                      draggable
                      aria-label={`Drag ${player.playerName} to reorder`}
                      className="cursor-grab select-none rounded-hud px-2 py-1 text-hud-lg font-bold text-hud-mute hover:text-hud-gold active:cursor-grabbing"
                      title="Drag to Reorder"
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "text/plain",
                          slotNumber.toString()
                        );
                        e.dataTransfer.effectAllowed = "move";

                        const row = e.currentTarget.closest("tr");
                        if (
                          !row ||
                          typeof e.dataTransfer.setDragImage !== "function"
                        ) {
                          return;
                        }
                        const rect = row.getBoundingClientRect();
                        e.dataTransfer.setDragImage(
                          row,
                          e.clientX - rect.left,
                          e.clientY - rect.top
                        );
                      }}
                    >
                      ≡
                    </span>
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-hud font-bold text-hud-mute transition-colors hover:bg-hud-blood-deep/60 hover:text-hud-bad-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold"
                      onClick={() => {
                        onFirePlayer(player.id);
                      }}
                      title="Fire Player"
                    >
                      X
                    </button>
                  </div>
                </td>
              </>
            ) : (
              <td colSpan={17} className="italic text-hud-mute">
                Empty slot
              </td>
            )}
          </tr>
        );
      })}
      <GutterSlotRow team={team} onHire={onHireSpecialist} />
      <tr data-testid="roster-value-total">
        <td colSpan={18} className="text-right text-hud-sm text-hud-mute">
          Players {formatGold(playersTeamValue(team))} + re-rolls &amp; staff{" "}
          {formatGold(staffTeamValue(team))} ={" "}
          <span className="font-hud-label font-bold text-hud-gold">
            TV {formatGold(calculateTeamValue(team))}
          </span>
        </td>
      </tr>
    </BloodBowlTable>
  );
}

const formatGold = (amount: number) => `${(amount / 1000).toFixed(0)}k`;

function PlayerBadges({
  player,
  onChooseVeteran,
  onChooseTeamCaptain,
}: {
  player: Player;
  onChooseVeteran?: ((playerId: string) => void) | undefined;
  onChooseTeamCaptain?: ((playerId: string) => void) | undefined;
}) {
  return (
    <>
      {mustAdvance(player) ? (
        <Chip tone="blood" title="Must advance before another match">
          Must advance
        </Chip>
      ) : canAdvance(player) ? (
        <Chip tone="gold" title="Eligible to advance">
          Can advance
        </Chip>
      ) : null}
      {player.veteran ? (
        <span data-testid="veteran-badge">
          <Chip
            tone="info"
            title="MA -1. Once per game: re-roll a failed pick-up, catch or Pass Action roll, or block dice that would Knock this player Down."
          >
            Veteran
          </Chip>
        </span>
      ) : onChooseVeteran && isLinemanPosition(player.keywords) ? (
        <button
          data-testid="choose-veteran"
          className={hudButtonClass("ghost", "sm")}
          onClick={() => {
            onChooseVeteran(player.id);
          }}
          title="Make this Lineman the team's Veteran (MA -1)"
        >
          Make Veteran
        </button>
      ) : null}
      {player.teamCaptain ? (
        <span data-testid="team-captain-badge">
          <Chip
            tone="gold"
            title="Pro, at no extra cost. While on the pitch, each Team Re-roll used rolls a D6: on a 6 it is free. Must be set up if able."
          >
            Captain
          </Chip>
        </span>
      ) : onChooseTeamCaptain && mayCaptain(player) ? (
        <button
          data-testid="choose-team-captain"
          className={hudButtonClass("ghost", "sm")}
          onClick={() => {
            onChooseTeamCaptain(player.id);
          }}
          title="Make this player the Team Captain (gains Pro)"
        >
          Make Captain
        </button>
      ) : null}
    </>
  );
}

function ValueCell({ team, player }: { team: Team; player: Player }) {
  return (
    <td
      className="num font-hud-label font-bold text-hud-gold"
      data-testid="player-value"
    >
      {playsNextGame(team, player) ? (
        formatGold(playerValue(player))
      ) : (
        <span
          title={`${notInTeamValueReason(team, player)}: not counted in team value`}
        >
          <s className="text-hud-mute">{formatGold(playerValue(player))}</s>
          <span className="block whitespace-nowrap font-normal text-hud-sm text-hud-mute">
            Not in TV
          </span>
        </span>
      )}
    </td>
  );
}

function CareerCells({ player }: { player: Player }) {
  return (
    <>
      {[
        player.careerStats?.matches ?? 0,
        player.careerStats?.touchdowns ?? 0,
        player.careerStats?.completions ?? 0,
        player.careerStats?.casualties ?? 0,
        player.careerStats?.kills ?? 0,
        player.careerStats?.mvps ?? 0,
      ].map((value, statIndex) => (
        <td key={statIndex} className={value ? "num" : "num text-hud-mute"}>
          {value}
        </td>
      ))}
    </>
  );
}

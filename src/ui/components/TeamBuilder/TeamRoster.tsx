import { useNavigate } from "react-router-dom";
import { Team } from "../../../types/Team";
import { canAdvance, mustAdvance } from "../../../game/progression/progression";
import { BloodBowlTable } from "../componentWarehouse/BloodBowlTable";
import { Chip, hudButtonClass } from "../componentWarehouse/HudKit";
import { numToHex } from "../TeamManagement/TeamStatsOverview";
import { SkillList, StatCells } from "./AvailableHires";
import { isLinemanPosition } from "../../../game/rules/rosterLegality";
import { PlayerPortrait } from "../common/PlayerPortrait";

interface TeamRosterProps {
  team: Team;
  onFirePlayer: (playerId: string) => void;
  onReorderPlayers: (sourceSlot: number, targetSlot: number) => void;
  /** Draft teams only: make this Lineman the Veteran (D8). */
  onChooseVeteran?: (playerId: string) => void;
}

/**
 * The team roster table — readable at the application's normal body-text
 * scale (overhaul-team-lifecycle-management, team-lifecycle-modes). Column
 * widths are declared once on the shared header/row `<colgroup>` so headers
 * and values always line up, and the table scrolls horizontally on narrow
 * viewports instead of shrinking text to fit.
 *
 * Also carries each player's career statistics (games played, touchdowns,
 * completions, casualties, kills, MVPs) as trailing columns
 * (team-management-layout: "Per-player career statistics are shown on the
 * team detail page, not the overview") — this replaced a separate
 * career-stats block that used to live on the Team Management overview page.
 */
export function TeamRoster({
  team,
  onFirePlayer,
  onReorderPlayers,
  onChooseVeteran,
}: TeamRosterProps) {
  const navigate = useNavigate();
  const formatGold = (amount: number) => `${(amount / 1000).toFixed(0)}k`;

  return (
    <BloodBowlTable
      title={team.name.toUpperCase()}
      aside={`${team.players.length} / 11 players · drag to reorder`}
      accent={{ color: numToHex(team.colors.primary) }}
      headers={[
        { label: "#", width: "40px", className: "num" },
        { label: "Name", width: "22%" },
        { label: "Position", width: "15%" },
        { label: "MA", className: "num" },
        { label: "ST", className: "num" },
        { label: "AG", className: "num" },
        { label: "PA", className: "num" },
        { label: "AV", className: "num" },
        { label: "Skills", width: "15%" },
        { label: "Cost", className: "num" },
        { label: "GP", className: "num" },
        { label: "TD", className: "num" },
        { label: "CMP", className: "num" },
        { label: "CAS", className: "num" },
        { label: "Kills", className: "num" },
        { label: "MVP", className: "num" },
        { label: "", width: "64px" }, // Actions
      ]}
    >
      {Array.from({ length: 11 }).map((_, index) => {
        const slotNumber = index + 1;
        const player = team.players.find((p) => p.number === slotNumber);
        const eligible = player ? canAdvance(player) : false;
        const required = player ? mustAdvance(player) : false;

        return (
          <tr
            key={slotNumber}
            className={player ? "cursor-move" : ""}
            draggable={!!player}
            onDragStart={(e) => {
              if (player) {
                e.dataTransfer.setData("text/plain", slotNumber.toString());
                e.dataTransfer.effectAllowed = "move";
              }
            }}
            onDragEnter={(e) => e.preventDefault()}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const sourceSlotString = e.dataTransfer.getData("text/plain");
              const sourceSlot = parseInt(sourceSlotString);

              if (isNaN(sourceSlot) || sourceSlot === slotNumber) return;
              onReorderPlayers(sourceSlot, slotNumber);
            }}
          >
            <td className="num select-none font-hud-label font-bold text-hud-mute">
              {slotNumber}
            </td>

            {player ? (
              <>
                <td className="text-base">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <button
                      className="rounded-hud text-left font-hud-label font-bold uppercase tracking-[0.03em] text-hud-bone hover:text-hud-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold"
                      onClick={() =>
                        navigate(`/build-team/${team.id}/player/${player.id}`)
                      }
                      title="View player development page"
                    >
                      {player.playerName}
                    </button>
                    {required ? (
                      <Chip tone="blood" title="Must advance before another match">
                        Must advance
                      </Chip>
                    ) : eligible ? (
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
                    ) : onChooseVeteran &&
                      isLinemanPosition(player.keywords) ? (
                      <button
                        data-testid="choose-veteran"
                        className={hudButtonClass("ghost", "sm")}
                        onClick={() => onChooseVeteran(player.id)}
                        title="Make this Lineman the team's Veteran (MA -1)"
                      >
                        Make Veteran
                      </button>
                    ) : null}
                  </div>
                </td>
                <td>
                  <span className="flex items-center gap-2 text-hud-sm text-[#ddd5c6]">
                    <PlayerPortrait
                      rosterName={team.rosterName}
                      positionName={player.positionName}
                      colors={team.colors}
                      size={40}
                    />
                    {player.positionName}
                  </span>
                </td>
                <StatCells stats={player.stats} />
                <td>
                  <SkillList skills={player.skills} />
                </td>
                <td className="num font-hud-label font-bold text-hud-gold">
                  {formatGold(player.cost)}
                </td>
                {[
                  player.careerStats?.matches ?? 0,
                  player.careerStats?.touchdowns ?? 0,
                  player.careerStats?.completions ?? 0,
                  player.careerStats?.casualties ?? 0,
                  player.careerStats?.kills ?? 0,
                  player.careerStats?.mvps ?? 0,
                ].map((value, statIndex) => (
                  <td
                    key={statIndex}
                    className={value ? "num" : "num text-hud-mute"}
                  >
                    {value}
                  </td>
                ))}
                <td>
                  <div className="flex items-center justify-end gap-1">
                    <span
                      className="cursor-grab select-none px-1 text-lg font-bold text-hud-mute hover:text-hud-gold"
                      title="Drag to Reorder"
                    >
                      ≡
                    </span>
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-hud font-bold text-hud-mute transition-colors hover:bg-hud-blood-deep/60 hover:text-[#ff8a8a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold"
                      onClick={() => onFirePlayer(player.id)}
                      title="Fire Player"
                    >
                      X
                    </button>
                  </div>
                </td>
              </>
            ) : (
              <td colSpan={16} className="italic text-hud-mute">
                Empty slot
              </td>
            )}
          </tr>
        );
      })}
    </BloodBowlTable>
  );
}

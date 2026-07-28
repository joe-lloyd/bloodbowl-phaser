import { useNavigate } from "react-router-dom";
import { Team } from "../../../types/Team";
import { canAdvance, mustAdvance } from "../../../game/progression/progression";
import {
  BloodBowlTable,
  TableRow,
  TableCell,
  CustomTableCell,
} from "../componentWarehouse/BloodBowlTable";

interface TeamRosterProps {
  team: Team;
  onFirePlayer: (playerId: string) => void;
  onReorderPlayers: (sourceSlot: number, targetSlot: number) => void;
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
}: TeamRosterProps) {
  const navigate = useNavigate();
  const formatGold = (amount: number) => `${(amount / 1000).toFixed(0)}k`;

  return (
    <BloodBowlTable
      title={team.name.toUpperCase()}
      headers={[
        { label: "#", width: "4%" },
        { label: "Name", width: "16%" },
        { label: "Pos", width: "9%" },
        { label: "Stats", width: "11%" },
        { label: "Skills", width: "14%" },
        { label: "Cost", width: "7%" },
        { label: "GP", width: "5%", className: "text-center" },
        { label: "TD", width: "5%", className: "text-center" },
        { label: "CMP", width: "5%", className: "text-center" },
        { label: "CAS", width: "5%", className: "text-center" },
        { label: "Kills", width: "5%", className: "text-center" },
        { label: "MVP", width: "5%", className: "text-center" },
        { label: "", width: "9%" }, // Actions
      ]}
      variant="blue"
    >
      {Array.from({ length: 11 }).map((_, index) => {
        const slotNumber = index + 1;
        const player = team.players.find((p) => p.number === slotNumber);
        const eligible = player ? canAdvance(player) : false;
        const required = player ? mustAdvance(player) : false;

        return (
          <TableRow
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
            <CustomTableCell className="text-sm text-center text-[#1d3860]/50 select-none">
              {slotNumber}
            </CustomTableCell>

            {player ? (
              <>
                <TableCell className="text-base font-bold text-[#1d3860]">
                  <button
                    className="text-left hover:underline"
                    onClick={() =>
                      navigate(`/build-team/${team.id}/player/${player.id}`)
                    }
                    title="View player development page"
                  >
                    {player.playerName}
                  </button>
                  {required ? (
                    <span
                      className="ml-2 rounded bg-[#8E1B1B] px-1.5 py-0.5 text-xs font-bold text-white"
                      title="Must advance before another match"
                    >
                      Must advance
                    </span>
                  ) : eligible ? (
                    <span
                      className="ml-2 rounded bg-bb-gold px-1.5 py-0.5 text-xs font-bold text-[#1d3860]"
                      title="Eligible to advance"
                    >
                      Can advance
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-base">
                  {player.positionName}
                </TableCell>
                <TableCell className="text-sm font-mono whitespace-nowrap">
                  {player.stats.MA} {player.stats.ST} {player.stats.AG}+{" "}
                  {player.stats.PA}+ {player.stats.AV}+
                </TableCell>
                <TableCell
                  className="text-sm italic"
                  title={player.skills.map((s) => s.type).join(", ")}
                >
                  {player.skills.map((s) => s.type).join(", ")}
                </TableCell>
                <TableCell className="text-base">
                  {formatGold(player.cost)}
                </TableCell>
                <TableCell className="text-sm text-center">
                  {player.careerStats?.matches ?? 0}
                </TableCell>
                <TableCell className="text-sm text-center">
                  {player.careerStats?.touchdowns ?? 0}
                </TableCell>
                <TableCell className="text-sm text-center">
                  {player.careerStats?.completions ?? 0}
                </TableCell>
                <TableCell className="text-sm text-center">
                  {player.careerStats?.casualties ?? 0}
                </TableCell>
                <TableCell className="text-sm text-center">
                  {player.careerStats?.kills ?? 0}
                </TableCell>
                <TableCell className="text-sm text-center">
                  {player.careerStats?.mvps ?? 0}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <span
                      className="text-[#1d3860] text-lg font-bold cursor-grab hover:text-bb-gold px-1 select-none"
                      title="Drag to Reorder"
                    >
                      ≡
                    </span>
                    <button
                      className="text-red-600 hover:text-red-800 font-bold px-1"
                      onClick={() => onFirePlayer(player.id)}
                      title="Fire Player"
                    >
                      X
                    </button>
                  </div>
                </TableCell>
              </>
            ) : (
              <TableCell
                colSpan={12}
                className="text-center italic text-[#1d3860]/30 text-sm py-3"
              >
                Empty Slot
              </TableCell>
            )}
          </TableRow>
        );
      })}
    </BloodBowlTable>
  );
}

import { useNavigate } from "react-router-dom";
import { Team } from "../../../types/Team";
import { SKILL_DEFINITIONS } from "../../../types/Skills";
import { canAdvance, mustAdvance } from "../../../game/progression/progression";
import {
  BloodBowlTable,
  TableRow,
  TableCell,
  CustomTableCell,
} from "../componentWarehouse/BloodBowlTable";
import { Tooltip } from "../componentWarehouse/Tooltip";

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
        { label: "#", width: "5%" },
        { label: "Name", width: "22%" },
        { label: "Pos", width: "13%" },
        { label: "Stats", width: "15%" },
        { label: "Skills", width: "22%" },
        { label: "Cost", width: "10%" },
        { label: "", width: "13%" }, // Actions
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
                <TableCell className="text-sm italic">
                  <div className="flex flex-wrap gap-1">
                    {player.skills.map((skill, index) => (
                      <Tooltip
                        key={`${skill.type}-${index}`}
                        content={SKILL_DEFINITIONS[skill.type].text}
                      >
                        <span className="cursor-help underline decoration-dotted">
                          {skill.type}
                          {skill.parameter != null
                            ? ` (${skill.parameter})`
                            : ""}
                          {index < player.skills.length - 1 ? "," : ""}
                        </span>
                      </Tooltip>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-base">
                  {formatGold(player.cost)}
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
                colSpan={6}
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

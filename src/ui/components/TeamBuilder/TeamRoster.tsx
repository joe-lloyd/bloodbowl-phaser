import { Team } from "../../../types/Team";
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

export function TeamRoster({
  team,
  onFirePlayer,
  onReorderPlayers,
}: TeamRosterProps) {
  const formatGold = (amount: number) => `${(amount / 1000).toFixed(0)}k`;

  return (
    <BloodBowlTable
      title={team.name.toUpperCase()}
      headers={[
        { label: "#", width: "5%" },
        { label: "Name", width: "25%" },
        { label: "Pos", width: "15%" },
        { label: "Stats", width: "15%" },
        { label: "Skills", width: "25%" },
        { label: "Cost", width: "12%" },
        { label: "", width: "8%" }, // Actions
      ]}
      variant="blue"
    >
      {Array.from({ length: 11 }).map((_, index) => {
        const slotNumber = index + 1;
        const player = team.players.find((p) => p.number === slotNumber);

        return (
          <TableRow
            key={slotNumber}
            className={`h-12 ${player ? "cursor-move" : ""}`}
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
            <CustomTableCell className="text-xs text-center text-[#1d3860]/50 select-none">
              {slotNumber}
            </CustomTableCell>

            {player ? (
              <>
                <TableCell className="text-xs font-bold text-[#1d3860]">
                  {player.playerName}
                </TableCell>
                <TableCell className="text-xs">{player.positionName}</TableCell>
                <TableCell className="text-[10px] font-mono whitespace-nowrap">
                  {player.stats.MA} {player.stats.ST} {player.stats.AG}+{" "}
                  {player.stats.PA}+ {player.stats.AV}+
                </TableCell>
                <TableCell
                  className="text-[10px] italic max-w-[200px]"
                  title={player.skills.map((s) => s.type).join(", ")}
                >
                  {player.skills.map((s) => s.type).join(", ")}
                </TableCell>
                <TableCell className="text-xs">
                  {formatGold(player.cost)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
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
                className="text-center italic text-[#1d3860]/30 text-xs py-3"
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

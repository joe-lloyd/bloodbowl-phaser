import { TeamColors, TeamRoster } from "../../../types/Team";
import { PlayerPortrait } from "../common/PlayerPortrait";
import { SKILL_DEFINITIONS } from "../../../types/Skills";
import { Button } from "../componentWarehouse/Button";
import { Tooltip } from "../componentWarehouse/Tooltip";
import {
  BloodBowlTable,
  TableRow,
  TableCell,
  CustomTableCell,
} from "../componentWarehouse/BloodBowlTable";

interface AvailableHiresProps {
  roster: TeamRoster;
  /** The team's kit, so each position is shown in it. */
  colors?: TeamColors;
  treasury: number;
  onHirePlayer: (positionName: string) => void;
}

export function AvailableHires({
  roster,
  colors = { primary: 0x8e1b1b, secondary: 0xffffff },
  treasury,
  onHirePlayer,
}: AvailableHiresProps) {
  const formatGold = (amount: number) => `${(amount / 1000).toFixed(0)}k`;

  return (
    <div className="bg-bb-warm-paper rounded-lg p-4 shadow-parchment-light border border-bb-divider">
      <BloodBowlTable
        title="AVAILABLE HIRES"
        headers={[
          "Pos",
          "MA",
          "ST",
          "AG",
          "PA",
          "AV",
          "Skills",
          "Cost",
          "Action",
        ]}
        variant="red"
      >
        {roster.playerTemplates.map((template) => (
          <TableRow key={`hire-${template.positionName}`}>
            <CustomTableCell className="text-base">
              <span className="flex items-center gap-2">
                <PlayerPortrait
                  rosterName={roster.rosterName}
                  positionName={template.positionName}
                  colors={colors}
                  size={44}
                />
                {template.positionName}
              </span>
            </CustomTableCell>
            <TableCell className="text-sm text-center">
              {template.stats.MA}
            </TableCell>
            <TableCell className="text-sm text-center">
              {template.stats.ST}
            </TableCell>
            <TableCell className="text-sm text-center">
              {template.stats.AG}+
            </TableCell>
            <TableCell className="text-sm text-center">
              {template.stats.PA}+
            </TableCell>
            <TableCell className="text-sm text-center">
              {template.stats.AV}+
            </TableCell>
            <TableCell className="text-sm italic">
              <div className="flex flex-wrap gap-1">
                {template.skills.map((skill, index) => (
                  <span key={`${skill.type}-${index}`}>
                    <Tooltip content={SKILL_DEFINITIONS[skill.type].text}>
                      <span className="cursor-help underline decoration-dotted">
                        {skill.type}
                        {skill.parameter != null ? ` (${skill.parameter})` : ""}
                      </span>
                    </Tooltip>
                    {index < template.skills.length - 1 ? "," : ""}
                  </span>
                ))}
              </div>
            </TableCell>
            <TableCell className="font-bold text-base">
              {formatGold(template.cost)}
            </TableCell>
            <TableCell>
              <Button
                className="!m-0 !px-2 !py-1 !text-sm w-full"
                onClick={() => onHirePlayer(template.positionName)}
                disabled={treasury < template.cost}
              >
                HIRE
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </BloodBowlTable>
    </div>
  );
}

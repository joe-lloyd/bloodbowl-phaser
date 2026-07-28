import { TeamRoster } from "../../../types/Team";
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
  treasury: number;
  onHirePlayer: (positionName: string) => void;
}

export function AvailableHires({
  roster,
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
              {template.positionName}
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
                  <Tooltip
                    key={`${skill.type}-${index}`}
                    content={SKILL_DEFINITIONS[skill.type].text}
                  >
                    <span className="cursor-help underline decoration-dotted">
                      {skill.type}
                      {skill.parameter != null ? ` (${skill.parameter})` : ""}
                      {index < template.skills.length - 1 ? "," : ""}
                    </span>
                  </Tooltip>
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

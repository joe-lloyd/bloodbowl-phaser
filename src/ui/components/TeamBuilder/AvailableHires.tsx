import { TeamRoster } from '../../../types/Team';
import { Button } from '../componentWarehouse/Button';
import { BloodBowlTable, TableRow, TableCell, CustomTableCell } from '../componentWarehouse/BloodBowlTable';

interface AvailableHiresProps {
    roster: TeamRoster;
    treasury: number;
    onHirePlayer: (positionName: string) => void;
}

export function AvailableHires({ roster, treasury, onHirePlayer }: AvailableHiresProps) {
    const formatGold = (amount: number) => `${(amount / 1000).toFixed(0)}k`;

    return (
        <div className="bg-bb-warm-paper rounded-lg p-4 shadow-parchment-light border border-bb-divider">
            <BloodBowlTable
                title="AVAILABLE HIRES"
                headers={["Pos", "MA", "ST", "AG", "PA", "AV", "Skills", "Cost", "Action"]}
                variant="red"
            >
                {roster.playerTemplates.map(template => (
                    <TableRow key={`hire-${template.positionName}`}>
                        <CustomTableCell className="text-xs">{template.positionName}</CustomTableCell>
                        <TableCell className="text-xs text-center">{template.stats.MA}</TableCell>
                        <TableCell className="text-xs text-center">{template.stats.ST}</TableCell>
                        <TableCell className="text-xs text-center">{template.stats.AG}+</TableCell>
                        <TableCell className="text-xs text-center">{template.stats.PA}+</TableCell>
                        <TableCell className="text-xs text-center">{template.stats.AV}+</TableCell>
                        <TableCell className="text-[10px] italic max-w-[120px] truncate" title={template.skills.map(s => s.type).join(', ')}>
                            {template.skills.map(s => s.type).join(', ')}
                        </TableCell>
                        <TableCell className="font-bold text-xs">{formatGold(template.cost)}</TableCell>
                        <TableCell>
                            <Button
                                className="!m-0 !px-2 !py-1 !text-[10px] w-full"
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

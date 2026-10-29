import { TeamColors, TeamRoster } from "../../../types/Team";
import { PlayerPortrait } from "../common/PlayerPortrait";
import { Skill, SKILL_DEFINITIONS } from "../../../types/Skills";
import { PlayerStats } from "../../../types/Player";
import { HudButton } from "../componentWarehouse/HudKit";
import { Tooltip } from "../componentWarehouse/Tooltip";
import { BloodBowlTable } from "../componentWarehouse/BloodBowlTable";

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
    <BloodBowlTable
      title="AVAILABLE HIRES"
      aside={`Treasury ${formatGold(treasury)}`}
      headers={[
        { label: "Position", width: "24%" },
        { label: "MA", className: "num" },
        { label: "ST", className: "num" },
        { label: "AG", className: "num" },
        { label: "PA", className: "num" },
        { label: "AV", className: "num" },
        { label: "Skills", width: "30%" },
        { label: "Cost", className: "num" },
        { label: "", width: "96px" },
      ]}
    >
      {roster.playerTemplates.map((template) => (
        <tr key={`hire-${template.positionName}`}>
          <td>
            <span className="flex items-center gap-3 font-hud-label text-base font-bold uppercase tracking-[0.03em]">
              <PlayerPortrait
                rosterName={roster.rosterName}
                positionName={template.positionName}
                colors={colors}
                size={44}
              />
              {template.positionName}
            </span>
          </td>
          <StatCells stats={template.stats} />
          <td>
            <SkillList skills={template.skills} />
          </td>
          <td className="num font-hud-label text-base font-bold text-hud-gold">
            {formatGold(template.cost)}
          </td>
          <td className="text-right">
            <HudButton
              size="sm"
              variant="secondary"
              block
              onClick={() => onHirePlayer(template.positionName)}
              disabled={treasury < template.cost}
            >
              HIRE
            </HudButton>
          </td>
        </tr>
      ))}
    </BloodBowlTable>
  );
}

/** Five statline cells in big display numerals: MA, ST, AG+, PA+, AV+. */
export function StatCells({ stats }: { stats: PlayerStats }) {
  return (
    <>
      {[
        stats.MA,
        stats.ST,
        `${stats.AG}+`,
        `${stats.PA}+`,
        `${stats.AV}+`,
      ].map((value, index) => (
        <td
          key={index}
          className="num font-hud-display text-hud-lg leading-none text-hud-bone"
        >
          {value}
        </td>
      ))}
    </>
  );
}

/** Skill names, each with its rule text on hover or focus. */
export function SkillList({ skills }: { skills: Skill[] }) {
  if (skills.length === 0) {
    return <span className="text-hud-mute">None</span>;
  }
  return (
    <div className="flex flex-wrap gap-x-1 gap-y-0.5 text-hud-sm text-[#ddd5c6]">
      {skills.map((skill, index) => (
        <span key={`${skill.type}-${index}`}>
          <Tooltip content={SKILL_DEFINITIONS[skill.type].text}>
            <span className="cursor-help underline decoration-hud-gold/40 decoration-dotted underline-offset-2">
              {skill.type}
              {skill.parameter != null ? ` (${skill.parameter})` : ""}
            </span>
          </Tooltip>
          {index < skills.length - 1 ? "," : ""}
        </span>
      ))}
    </div>
  );
}

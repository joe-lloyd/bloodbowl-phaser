import { STAT_HEADERS } from "./statHeaders";
import { type TeamColors, type TeamRoster } from "../../../types/Team";
import { type PlayerTemplate } from "../../../types/Player";
import { PlayerPortrait } from "../common/PlayerPortrait";
import { type Skill, SKILL_DEFINITIONS } from "../../../types/Skills";
import { type PlayerStats } from "../../../types/Player";
import { HudButton } from "../componentWarehouse/HudKit";
import { Tooltip } from "../componentWarehouse/Tooltip";
import { BloodBowlTable } from "../componentWarehouse/BloodBowlTable";
import type { PositionAllowance } from "../../../game/rules/teamPricing";

interface AvailableHiresProps {
  roster: TeamRoster;

  colors?: TeamColors;
  treasury: number;
  onHirePlayer: (positionName: string) => void;

  hireRefusal?: (template: PlayerTemplate) => string | undefined;

  allowance?: (template: PlayerTemplate) => PositionAllowance;
}

const formatGold = (amount: number) => `${(amount / 1000).toFixed(0)}k`;

export function AvailableHires({
  roster,
  colors = { primary: 0x8e1b1b, secondary: 0xffffff },
  treasury,
  onHirePlayer,
  hireRefusal,
  allowance,
}: AvailableHiresProps) {
  return (
    <BloodBowlTable
      title="AVAILABLE HIRES"
      aside={`Treasury ${formatGold(treasury)}`}
      headers={[
        { label: "Position", width: "24%" },
        ...STAT_HEADERS,
        { label: "Skills", width: "30%" },
        { label: "Allowed", className: "num" },
        { label: "Cost", className: "num" },
        { label: "", width: "96px" },
      ]}
    >
      {roster.playerTemplates.map((template) => {
        const refusal =
          hireRefusal?.(template) ??
          (treasury < template.cost
            ? "Not enough gold in the treasury."
            : undefined);
        return (
          <tr key={`hire-${template.positionName}`}>
            <td>
              <span className="flex items-center gap-3 font-hud-label text-hud-base font-bold uppercase tracking-[0.03em]">
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
            <AllowedCell
              allowance={
                allowance?.(template) ?? {
                  hired: 0,
                  max: template.maxAllowed ?? 0,
                }
              }
            />
            <td className="num font-hud-label text-hud-base font-bold text-hud-gold">
              {formatGold(template.cost)}
            </td>
            <td className="text-right">
              <HudButton
                size="sm"
                variant="secondary"
                block
                onClick={() => {
                  onHirePlayer(template.positionName);
                }}
                disabled={!!refusal}
                title={refusal}
              >
                HIRE
              </HudButton>
            </td>
          </tr>
        );
      })}
    </BloodBowlTable>
  );
}

function AllowedCell({ allowance }: { allowance: PositionAllowance }) {
  const full = allowance.hired >= allowance.max;
  return (
    <td
      className={`num font-hud-label text-hud-base font-bold tabular-nums ${
        full ? "text-hud-mute" : "text-hud-bone"
      }`}
      data-testid="hire-allowance"
      title={`${String(allowance.hired)} hired of ${String(allowance.max)} allowed`}
    >
      {allowance.hired} / {allowance.max}
    </td>
  );
}

export function StatCells({ stats }: { stats: PlayerStats }) {
  return (
    <>
      {[
        stats.MA,
        stats.ST,
        `${String(stats.AG)}+`,
        stats.PA > 0 ? `${String(stats.PA)}+` : "-",
        `${String(stats.AV)}+`,
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

export function SkillList({ skills }: { skills: Skill[] }) {
  if (skills.length === 0) {
    return <span className="text-hud-mute">None</span>;
  }
  return (
    <div className="flex flex-wrap gap-x-1 gap-y-0.5 text-hud-sm text-hud-bone">
      {skills.map((skill, index) => (
        <span key={`${skill.type}-${String(index)}`}>
          <Tooltip content={SKILL_DEFINITIONS[skill.type].description}>
            <span className="cursor-help underline decoration-hud-gold/40 decoration-dotted underline-offset-2">
              {skill.type}
              {skill.parameter == null ? "" : ` (${String(skill.parameter)})`}
            </span>
          </Tooltip>
          {index < skills.length - 1 ? "," : ""}
        </span>
      ))}
    </div>
  );
}

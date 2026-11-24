import { SKILL_DEFINITIONS, type SkillType } from "../../../types/Skills";
import { cx, hudChoiceClass } from "../componentWarehouse/HudKit";

export function SkillOption({
  skill,
  rolled,
  selected = false,
  testId = "skill-option",
  onChoose,
}: {
  skill: SkillType;
  rolled?: string;
  selected?: boolean;
  testId?: string;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-skill={skill}
      aria-pressed={selected}
      onClick={onChoose}
      className={cx(hudChoiceClass(selected), "px-3 py-2 text-left")}
    >
      <span className="block font-hud-label text-hud-sm font-bold uppercase tracking-[0.04em] text-hud-bone">
        {rolled === undefined ? skill : `${rolled}: ${skill}`}
      </span>
      <SkillText skill={skill} />
    </button>
  );
}

export function SkillText({ skill }: { skill: SkillType }) {
  return (
    <span className="block font-hud-body text-hud-sm font-normal normal-case tracking-normal text-hud-dim">
      {SKILL_DEFINITIONS[skill].description}
    </span>
  );
}

export function SkillGrid({
  skills,
  selected,
  onSelect,
}: {
  skills: readonly SkillType[];
  selected: SkillType | "";
  onSelect: (skill: SkillType) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Skill"
      className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4"
    >
      {skills.map((skill) => (
        <SkillOption
          key={skill}
          skill={skill}
          selected={skill === selected}
          onChoose={() => {
            onSelect(skill);
          }}
        />
      ))}
    </div>
  );
}

import type { RandomSkillCandidate } from "../../../types/Player";
import type { SkillType } from "../../../types/Skills";
import { SkillOption } from "./SkillOption";

export function CandidateOptions({
  candidates,
  onChoose,
}: {
  candidates: readonly RandomSkillCandidate[];
  onChoose: (skill: SkillType) => void;
}) {
  const skills = [...new Set(candidates.map(({ skill }) => skill))];
  const rolls = (rolled: SkillType) =>
    candidates
      .filter(({ skill }) => skill === rolled)
      .map(({ firstD6, secondD6 }) => `${String(firstD6)}, ${String(secondD6)}`)
      .join(" and ");
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {skills.map((skill) => (
        <SkillOption
          key={skill}
          skill={skill}
          rolled={rolls(skill)}
          testId="random-candidate"
          onChoose={() => {
            onChoose(skill);
          }}
        />
      ))}
    </div>
  );
}

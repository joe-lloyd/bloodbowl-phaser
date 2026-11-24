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
  const distinct = new Map(
    candidates.map((candidate) => [candidate.skill, candidate])
  );
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {[...distinct.values()].map(({ skill, firstD6, secondD6 }) => (
        <SkillOption
          key={skill}
          skill={skill}
          rolled={`${String(firstD6)}, ${String(secondD6)}`}
          testId="random-candidate"
          onChoose={() => {
            onChoose(skill);
          }}
        />
      ))}
    </div>
  );
}

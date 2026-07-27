import { Player } from "../../../types/Player";
import { SkillCategory, SkillType, SKILL_DEFINITIONS } from "../../../types/Skills";
import {
  AdvancementChoice,
  characteristicChoices,
  nextAdvancementCosts,
  RandomSkillCandidate,
} from "../../../game/progression/progression";

/**
 * Advanced League advancement UI: extracted from the old post-match results
 * screen so Manage Team's pending-development panel can present the same
 * SPP-spend flow (see team-advancement-modes: "Team development is
 * completed from Manage Team").
 */
export type SkillAccess = "primary" | "secondary";

export function AdvancementForm({
  player,
  kind,
  setKind,
  access,
  setAccess,
  category,
  setCategory,
  categories,
  skill,
  setSkill,
  skills,
  randomCandidates,
  rollRandom,
  characteristicRoll,
  rollCharacteristic,
  applyChoice,
}: {
  player: Player;
  kind: AdvancementChoice["kind"];
  setKind: (kind: AdvancementChoice["kind"]) => void;
  access: SkillAccess;
  setAccess: (access: SkillAccess) => void;
  category: SkillCategory | "";
  setCategory: (category: SkillCategory | "") => void;
  categories: SkillCategory[];
  skill: SkillType | "";
  setSkill: (skill: SkillType | "") => void;
  skills: SkillType[];
  randomCandidates: [RandomSkillCandidate, RandomSkillCandidate] | null;
  rollRandom: () => void;
  characteristicRoll: number | null;
  rollCharacteristic: () => void;
  applyChoice: (choice: AdvancementChoice) => void;
}) {
  const costs = nextAdvancementCosts(player)!;
  const options: {
    kind: AdvancementChoice["kind"];
    label: string;
    cost: number;
  }[] = [
    {
      kind: "random-primary",
      label: "Random Primary",
      cost: costs.randomPrimary,
    },
    {
      kind: "chosen-primary",
      label: "Choose Primary",
      cost: costs.chosenPrimary,
    },
    {
      kind: "chosen-secondary",
      label: "Choose Secondary",
      cost: costs.chosenSecondary,
    },
    {
      kind: "characteristic",
      label: "Characteristic",
      cost: costs.characteristic,
    },
  ];

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.kind}
            disabled={player.spp < option.cost}
            onClick={() => setKind(option.kind)}
            className={`rounded border px-3 py-2 ${
              kind === option.kind
                ? "border-bb-gold bg-bb-blood-red"
                : "border-slate-600"
            } disabled:opacity-40`}
          >
            {option.label} ({option.cost} SPP)
          </button>
        ))}
      </div>

      {kind === "characteristic" ? (
        <div className="mt-4">
          <button
            onClick={rollCharacteristic}
            disabled={characteristicRoll !== null}
            className="rounded bg-bb-ink-blue px-4 py-2"
          >
            Roll D8
          </button>
          {characteristicRoll !== null && (
            <>
              <p className="my-3 text-lg">Rolled {characteristicRoll}</p>
              <div className="flex flex-wrap gap-2">
                {characteristicChoices(player, characteristicRoll).map(
                  (stat) => (
                    <button
                      key={stat}
                      onClick={() =>
                        applyChoice({
                          kind: "characteristic",
                          roll: characteristicRoll,
                          stat,
                        })
                      }
                      className="rounded border border-bb-gold bg-bb-blood-red px-4 py-2"
                    >
                      Improve {stat}
                    </button>
                  )
                )}
              </div>
              <p className="mt-4">
                Or take a chosen skill at the spent Characteristic cost:
              </p>
              <SkillSelectors
                access={access}
                setAccess={setAccess}
                category={category}
                setCategory={setCategory}
                categories={
                  access === "primary"
                    ? (player.primary ?? [])
                    : (player.secondary ?? [])
                }
                skill={skill}
                setSkill={setSkill}
                skills={skills}
              />
              <button
                disabled={!skill}
                onClick={() =>
                  skill &&
                  applyChoice({
                    kind: "characteristic-fallback",
                    roll: characteristicRoll,
                    skill,
                    access,
                  })
                }
                className="mt-3 rounded bg-bb-ink-blue px-4 py-2 disabled:opacity-40"
              >
                Confirm skill fallback
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <SkillSelectors
            access={access}
            setAccess={setAccess}
            lockAccess
            category={category}
            setCategory={setCategory}
            categories={categories}
            skill={skill}
            setSkill={setSkill}
            skills={skills}
          />
          {kind === "random-primary" ? (
            <>
              <button
                disabled={!category || !!randomCandidates}
                onClick={rollRandom}
                className="mt-3 rounded bg-bb-ink-blue px-4 py-2 disabled:opacity-40"
              >
                Roll two candidates
              </button>
              {randomCandidates && (
                <div className="mt-3 flex gap-3">
                  {[
                    ...new Map(
                      randomCandidates.map((candidate) => [
                        candidate.skill,
                        candidate,
                      ])
                    ).values(),
                  ].map((candidate) => (
                    <button
                      key={candidate.skill}
                      onClick={() =>
                        applyChoice({
                          kind: "random-primary",
                          skill: candidate.skill,
                        })
                      }
                      className="rounded border border-bb-gold bg-bb-blood-red px-4 py-2"
                    >
                      {candidate.firstD6}, {candidate.secondD6}:{" "}
                      {candidate.skill}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <button
              disabled={!skill}
              onClick={() =>
                skill &&
                applyChoice({
                  kind,
                  skill,
                } as AdvancementChoice)
              }
              className="mt-3 rounded bg-bb-ink-blue px-4 py-2 disabled:opacity-40"
            >
              Confirm skill
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function SkillSelectors({
  access,
  setAccess,
  lockAccess = false,
  category,
  setCategory,
  categories,
  skill,
  setSkill,
  skills,
}: {
  access: SkillAccess;
  setAccess: (access: SkillAccess) => void;
  lockAccess?: boolean;
  category: SkillCategory | "";
  setCategory: (category: SkillCategory | "") => void;
  categories: SkillCategory[];
  skill: SkillType | "";
  setSkill: (skill: SkillType | "") => void;
  skills: SkillType[];
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {!lockAccess && (
        <select
          value={access}
          onChange={(event) => setAccess(event.target.value as SkillAccess)}
          className="rounded bg-slate-950 p-2"
        >
          <option value="primary">Primary</option>
          <option value="secondary">Secondary</option>
        </select>
      )}
      <select
        value={category}
        onChange={(event) =>
          setCategory(event.target.value as SkillCategory | "")
        }
        className="rounded bg-slate-950 p-2"
      >
        <option value="">Choose category</option>
        {categories.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <select
        value={skill}
        disabled={!category}
        onChange={(event) => setSkill(event.target.value as SkillType | "")}
        className="rounded bg-slate-950 p-2 disabled:opacity-40"
      >
        <option value="">Choose skill</option>
        {skills.map((item) => (
          <option key={item} value={item}>
            {item}
            {SKILL_DEFINITIONS[item].category ? "" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

import { useState } from "react";
import { Player } from "../../../types/Player";
import { SkillCategory, SkillType } from "../../../types/Skills";
import { calculateTeamValue, Team } from "../../../types/Team";
import { saveTeam } from "../../../game/managers/TeamManager";
import { IRNGService } from "../../../services/rng/RNGService";
import { Notice } from "../componentWarehouse/HudKit";
import {
  AdvancementChoice,
  applyAdvancement,
  eligibleSkills,
  nextAdvancementCosts,
  rollPendingCharacteristic,
  rollPendingRandomPrimary,
} from "../../../game/progression/progression";
import { AdvancementForm, SkillAccess } from "../shared/AdvancementForm";

interface PlayerDevelopmentProps {
  player: Player;
  team: Team;
  rngService: Pick<IRNGService, "rollDie">;
  /** Called after an advancement is applied and the team is saved. */
  onApplied?: () => void;
}

/**
 * Standard SPP advancement — the one place the app spends SPP on a skill or
 * characteristic. Used by the player page and by Manage Team's pending
 * development panel, so both behave the same.
 *
 * Rolls (Random Primary candidates, the Characteristic D8) are stored on the
 * player and the team is saved the moment they are made. Reloading shows
 * the same roll, and the coach must spend it before choosing anything else.
 */
export function PlayerDevelopment({
  player,
  team,
  rngService,
  onApplied,
}: PlayerDevelopmentProps) {
  const [selectedKind, setSelectedKind] = useState<
    AdvancementChoice["kind"] | null
  >(null);
  const [access, setAccess] = useState<SkillAccess>("primary");
  const [category, setCategory] = useState<SkillCategory | "">("");
  const [skill, setSkill] = useState<SkillType | "">("");
  const [error, setError] = useState("");
  const [, setRevision] = useState(0);

  const costs = nextAdvancementCosts(player);
  if (!costs) {
    return (
      <p className="text-hud-mute">
        This player is a Legend and cannot advance further.
      </p>
    );
  }

  const savedRoll = player.pendingAdvancementRoll;
  const kind = savedRoll ? savedRoll.kind : selectedKind;
  const activeCategory =
    savedRoll?.kind === "random-primary" ? savedRoll.category : category;
  const categories =
    access === "primary" ? (player.primary ?? []) : (player.secondary ?? []);
  const skills = activeCategory ? eligibleSkills(player, [activeCategory]) : [];

  const attempt = (action: () => void) => {
    try {
      action();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const rollAndSave = (roll: () => void) =>
    attempt(() => {
      roll();
      saveTeam(team);
      setCategory("");
      setSkill("");
      setRevision((value) => value + 1);
    });

  const applyChoice = (choice: AdvancementChoice) =>
    attempt(() => {
      applyAdvancement(player, choice);
      team.teamValue = calculateTeamValue(team);
      saveTeam(team);
      setSelectedKind(null);
      setAccess("primary");
      setCategory("");
      setSkill("");
      onApplied?.();
    });

  return (
    <>
      <AdvancementForm
        player={player}
        savedRoll={savedRoll}
        kind={kind}
        setKind={(next) => {
          setSelectedKind(next);
          setAccess(next === "chosen-secondary" ? "secondary" : "primary");
          setCategory("");
          setSkill("");
          setError("");
        }}
        access={access}
        setAccess={(next) => {
          setAccess(next);
          setCategory("");
          setSkill("");
        }}
        category={activeCategory}
        setCategory={(next) => {
          setCategory(next);
          setSkill("");
        }}
        categories={categories}
        skill={skill}
        setSkill={setSkill}
        skills={skills}
        rollRandom={() =>
          category &&
          rollAndSave(() =>
            rollPendingRandomPrimary(player, category, rngService)
          )
        }
        rollCharacteristic={() =>
          rollAndSave(() => rollPendingCharacteristic(player, rngService))
        }
        applyChoice={applyChoice}
      />
      {error && (
        <Notice tone="bad" role="alert" className="mt-3">
          {error}
        </Notice>
      )}
    </>
  );
}

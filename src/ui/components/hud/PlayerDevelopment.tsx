import { useState } from "react";
import {
  type PendingAdvancementRoll,
  type Player,
} from "../../../types/Player";
import type { SkillCategory, SkillType } from "../../../types/Skills";
import { calculateTeamValue, type Team } from "../../../types/Team";
import { loadTeams } from "../../../game/managers/TeamManager";
import { type IRNGService } from "../../../services/rng/RNGService";
import { Notice } from "../componentWarehouse/HudKit";
import {
  type AdvancementChoice,
  applyAdvancement,
  eligibleSkills,
  mustAdvance,
  nextAdvancementCosts,
  rollPendingCharacteristic,
  rollPendingRandomPrimary,
} from "../../../game/progression/progression";
import { AdvancementForm, type SkillAccess } from "../shared/AdvancementForm";
import { advancementThrows, type RollThrow } from "../shared/rollThrows";
import { RollStage } from "../shared/RollTray";
import { useRollTray } from "../shared/useRollTray";
import { isTeamSaving } from "../../hooks/teamSaveLock";
import { restoreTeam } from "../../../headless/serialization";
import { commitPlayerChange } from "./commitPlayerChange";

interface PlayerDevelopmentProps {
  player: Player;
  team: Team;
  rngService: Pick<IRNGService, "rollDie">;

  onSaved?: () => void;

  onNotice?: (message: string) => void;
}

class StaleRollError extends Error {}

export function PlayerDevelopment({
  player,
  team,
  rngService,
  onSaved,
  onNotice,
}: PlayerDevelopmentProps) {
  const [selectedKind, setSelectedKind] = useState<
    AdvancementChoice["kind"] | null
  >(null);
  const [access, setAccess] = useState<SkillAccess>("primary");
  const [category, setCategory] = useState<SkillCategory | "">("");
  const [skill, setSkill] = useState<SkillType | "">("");
  const [error, setError] = useState("");
  const dice = useRollTray(team);
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

  const attempt = async (action: () => Promise<void>) => {
    if (isTeamSaving()) return;
    try {
      await action();
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const rollAndSave = (
    roll: (latestPlayer: Player) => PendingAdvancementRoll
  ) => {
    void attempt(async () => {
      let throws: RollThrow[] = [];
      await commitPlayerChange(team, player.id, (_latestTeam, latestPlayer) => {
        if (latestPlayer.pendingAdvancementRoll) return;
        throws = advancementThrows(roll(latestPlayer));
      });
      dice.roll(throws);
      setCategory("");
      setSkill("");
      setRevision((value) => value + 1);
      onSaved?.();
    });
  };

  const applyChoice = (choice: AdvancementChoice) => {
    void attempt(async () => {
      const shownRoll = JSON.stringify(savedRoll ?? null);
      try {
        await commitPlayerChange(team, player.id, (latestTeam, latestPlayer) => {
          if (
            JSON.stringify(latestPlayer.pendingAdvancementRoll ?? null) !==
            shownRoll
          ) {
            throw new StaleRollError(
              "This player's roll changed in another window. The latest version is shown now; check it before choosing."
            );
          }
          applyAdvancement(latestPlayer, choice);
          latestTeam.teamValue = calculateTeamValue(latestTeam);

          if (!mustAdvance(latestPlayer)) {
            latestTeam.pendingDevelopment = (
              latestTeam.pendingDevelopment ?? []
            ).filter(
              (entry) =>
                !(
                  entry.kind === "advanced-league-advancement" &&
                  entry.playerId === latestPlayer.id
                )
            );
          }
        });
      } catch (cause) {
        if (cause instanceof StaleRollError) {
          const latestTeam = loadTeams().find((t) => t.id === team.id);
          if (latestTeam) restoreTeam(team, latestTeam);
          setRevision((value) => value + 1);
          onSaved?.();
          if (onNotice) {
            onNotice(cause.message);
            return;
          }
        }
        throw cause;
      }
      dice.clear();
      setSelectedKind(null);
      setAccess("primary");
      setCategory("");
      setSkill("");
      onSaved?.();
    });
  };

  return (
    <>
      <RollStage dice={dice}>
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
            rollAndSave((latestPlayer) =>
              rollPendingRandomPrimary(latestPlayer, category, rngService)
            )
          }
          rollCharacteristic={() => {
            rollAndSave((latestPlayer) =>
              rollPendingCharacteristic(latestPlayer, rngService)
            );
          }}
          applyChoice={applyChoice}
        />
      </RollStage>
      {error && (
        <Notice tone="bad" role="alert" className="mt-3">
          {error}
        </Notice>
      )}
    </>
  );
}

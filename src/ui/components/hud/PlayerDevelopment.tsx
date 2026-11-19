import { useState } from "react";
import { type Player } from "../../../types/Player";
import type { SkillCategory, SkillType } from "../../../types/Skills";
import { calculateTeamValue, type Team } from "../../../types/Team";
import { loadTeams, saveTeam } from "../../../game/managers/TeamManager";
import { dehydrateTeam } from "../../../data/persistence/teamPersistence";
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

interface PlayerDevelopmentProps {
  player: Player;
  team: Team;
  rngService: Pick<IRNGService, "rollDie">;

  onSaved?: () => void;

  onNotice?: (message: string) => void;
}

function commit(
  team: Team,
  playerId: string,
  change: (latestTeam: Team, latestPlayer: Player) => void
): void {
  const latestTeam = loadTeams().find((t) => t.id === team.id);
  const latestPlayer = latestTeam?.players.find((p) => p.id === playerId);
  if (!latestTeam || !latestPlayer) {
    throw new Error("This player could not be found in the saved team.");
  }
  change(latestTeam, latestPlayer);
  saveTeam(latestTeam);
  const stored = loadTeams().find((t) => t.id === team.id);
  if (
    !stored ||
    JSON.stringify(dehydrateTeam(stored)) !==
      JSON.stringify(dehydrateTeam(latestTeam))
  ) {
    throw new Error("The team could not be saved, so nothing was changed.");
  }
  adopt(team, latestTeam);
}

function adopt(team: Team, latestTeam: Team): void {
  const previous = new Map(team.players.map((p) => [p.id, p]));
  const players = latestTeam.players.map((latest) => {
    const existing = previous.get(latest.id);
    return existing ? replaceContents(existing, latest) : latest;
  });
  replaceContents(team, latestTeam);
  team.players = players;
}

class StaleRollError extends Error {}

function replaceContents<T extends object>(target: T, source: T): T {
  for (const key of Object.keys(target)) {
    if (!(key in source)) delete (target as Record<string, unknown>)[key];
  }
  return Object.assign(target, source);
}

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

  const rollAndSave = (roll: (latestPlayer: Player) => void) => {
    attempt(() => {
      commit(team, player.id, (_latestTeam, latestPlayer) => {
        if (!latestPlayer.pendingAdvancementRoll) roll(latestPlayer);
      });
      setCategory("");
      setSkill("");
      setRevision((value) => value + 1);
      onSaved?.();
    });
  };

  const applyChoice = (choice: AdvancementChoice) => {
    attempt(() => {
      const shownRoll = JSON.stringify(savedRoll ?? null);
      try {
        commit(team, player.id, (latestTeam, latestPlayer) => {
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
          if (latestTeam) adopt(team, latestTeam);
          setRevision((value) => value + 1);
          onSaved?.();
          if (onNotice) {
            onNotice(cause.message);
            return;
          }
        }
        throw cause;
      }
      setSelectedKind(null);
      setAccess("primary");
      setCategory("");
      setSkill("");
      onSaved?.();
    });
  };

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
      {error && (
        <Notice tone="bad" role="alert" className="mt-3">
          {error}
        </Notice>
      )}
    </>
  );
}

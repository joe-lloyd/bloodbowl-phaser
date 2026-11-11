import { useState } from "react";
import { Player } from "../../../types/Player";
import { SkillCategory, SkillType } from "../../../types/Skills";
import { calculateTeamValue, Team } from "../../../types/Team";
import { loadTeams, saveTeam } from "../../../game/managers/TeamManager";
import { dehydrateTeam } from "../../../data/persistence/teamPersistence";
import { IRNGService } from "../../../services/rng/RNGService";
import { Notice } from "../componentWarehouse/HudKit";
import {
  AdvancementChoice,
  applyAdvancement,
  eligibleSkills,
  mustAdvance,
  nextAdvancementCosts,
  rollPendingCharacteristic,
  rollPendingRandomPrimary,
} from "../../../game/progression/progression";
import { AdvancementForm, SkillAccess } from "../shared/AdvancementForm";

interface PlayerDevelopmentProps {
  player: Player;
  team: Team;
  rngService: Pick<IRNGService, "rollDie">;
  /**
   * Called after a roll or an advancement is saved. The caller's `team` has
   * been updated in place to the saved copy; re-render from it.
   */
  onSaved?: () => void;
}

/**
 * Apply a change to the latest stored copy of the team, save it, and read
 * it back. Working on the stored copy means another tab's saved roll is
 * seen rather than overwritten; reading back catches a write the repository
 * only logged (a full localStorage, say). The caller's team is replaced
 * in place only once the save is confirmed.
 */
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

/**
 * Update the caller's objects in place (the player and team props this
 * component and its parent hold) rather than swapping in new ones.
 */
function adopt(team: Team, latestTeam: Team): void {
  const previous = new Map(team.players.map((p) => [p.id, p]));
  const players = latestTeam.players.map((latest) => {
    const existing = previous.get(latest.id);
    return existing ? replaceContents(existing, latest) : latest;
  });
  replaceContents(team, latestTeam);
  team.players = players;
}

/** Another window changed this player's saved roll since it was shown. */
class StaleRollError extends Error {}

/** Make `target` hold exactly `source`'s fields, keeping its identity. */
function replaceContents<T extends object>(target: T, source: T): T {
  for (const key of Object.keys(target)) {
    if (!(key in source)) delete (target as Record<string, unknown>)[key];
  }
  return Object.assign(target, source);
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
  onSaved,
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

  const rollAndSave = (roll: (latestPlayer: Player) => void) =>
    attempt(() => {
      commit(team, player.id, (_latestTeam, latestPlayer) => {
        // Another tab may have rolled already: keep that roll instead
        if (!latestPlayer.pendingAdvancementRoll) roll(latestPlayer);
      });
      setCategory("");
      setSkill("");
      setRevision((value) => value + 1);
      onSaved?.();
    });

  const applyChoice = (choice: AdvancementChoice) =>
    attempt(() => {
      const shownRoll = JSON.stringify(savedRoll ?? null);
      try {
        commit(team, player.id, (latestTeam, latestPlayer) => {
          // Only spend the roll this form is showing: if another window has
          // already spent (or made) a roll, this choice is out of date
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
          // Resolve Manage Team's Advanced League entry in the same save, so
          // a spent player is never left with an unresolved entry.
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
        }
        throw cause;
      }
      setSelectedKind(null);
      setAccess("primary");
      setCategory("");
      setSkill("");
      onSaved?.();
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
          rollAndSave((latestPlayer) =>
            rollPendingRandomPrimary(latestPlayer, category, rngService)
          )
        }
        rollCharacteristic={() =>
          rollAndSave((latestPlayer) =>
            rollPendingCharacteristic(latestPlayer, rngService)
          )
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

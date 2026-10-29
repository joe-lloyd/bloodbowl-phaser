import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PlayerStats } from "../../../types/Player";
import { loadTeams, saveTeam } from "../../../game/managers/TeamManager";
import { canAdvance, mustAdvance } from "../../../game/progression/progression";
import { RNGService } from "../../../services/rng/RNGService";
import { PlayerDevelopment } from "../hud/PlayerDevelopment";
import {
  Chip,
  EmptyState,
  HudButton,
  PageHeader,
  PageShell,
  Section,
  Stat,
} from "../componentWarehouse/HudKit";

const STAT_LABELS: Record<keyof PlayerStats, string> = {
  MA: "Movement",
  ST: "Strength",
  AG: "Agility",
  PA: "Passing",
  AV: "Armour",
};

/**
 * Manage Team's per-player development page (overhaul-team-lifecycle-
 * management, player-development-page capability). This is the only place
 * standard SPP advancement is applied — post-match only records SPP and
 * flags who has pending development, it never assigns a skill directly.
 *
 * Advancement mode: this page always offers standard SPP spending. Matched
 * Play and Sevens Skill Selection teams don't earn SPP (see
 * team-advancement-modes), so `canAdvance` naturally stays false for their
 * players here — this page needs no separate mode check of its own.
 */
export function PlayerPage() {
  const navigate = useNavigate();
  const { teamId, playerId } = useParams<{
    teamId: string;
    playerId: string;
  }>();
  const [, setRefreshTick] = useState(0);
  const rngService = useMemo(() => new RNGService(Date.now()), []);

  const teams = loadTeams();
  const team = teams.find((candidate) => candidate.id === teamId);
  const player = team?.players.find((candidate) => candidate.id === playerId);

  if (!team || !player) {
    return (
      <PageShell width="narrow" className="flex flex-col justify-center">
        <EmptyState
          title="Player not found"
          titleAs="h2"
          action={
            <HudButton
              variant="ghost"
              onClick={() => navigate(`/build-team/${teamId ?? ""}`)}
            >
              Back to Manage Team
            </HudButton>
          }
        />
      </PageShell>
    );
  }

  const refresh = () => setRefreshTick((value) => value + 1);

  const startingSkillNames = new Set(
    player.skills
      .map((skill) => skill.type)
      .filter(
        (type) =>
          !(player.advancements ?? []).some((advancement) =>
            advancement.type !== "characteristic"
              ? advancement.name === type
              : false
          )
      )
  );
  const startingSkills = player.skills.filter((skill) =>
    startingSkillNames.has(skill.type)
  );
  const gainedSkills = player.skills.filter(
    (skill) => !startingSkillNames.has(skill.type)
  );

  const characteristicRows = (Object.keys(player.stats) as (keyof PlayerStats)[]).map(
    (stat) => {
      const current = player.stats[stat];
      const base = player.baseStats[stat];
      const advances = player.characteristicAdvances?.[stat] ?? 0;
      return { stat, current, base, advances };
    }
  );

  const eligible = canAdvance(player);
  const required = mustAdvance(player);

  return (
    <PageShell width="medium">
      <PageHeader
        eyebrow={`${player.positionName} · Level ${player.level} · ${team.name}`}
        title={`#${player.number} ${player.playerName}`}
        actions={
          <HudButton
            variant="ghost"
            onClick={() => navigate(`/build-team/${team.id}`)}
          >
            Back to Manage Team
          </HudButton>
        }
      />

      <Section title="Characteristics">
        <div className="flex gap-2">
          {characteristicRows.map(({ stat, current, base }) => (
            <Stat
              key={stat}
              label={STAT_LABELS[stat]}
              value={current}
              tone={current !== base ? "gold" : undefined}
            />
          ))}
        </div>
        {characteristicRows.some(({ current, base }) => current !== base) && (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-hud-sm text-hud-dim">
            {characteristicRows
              .filter(({ current, base }) => current !== base)
              .map(({ stat, base, advances }) => (
                <li key={stat}>
                  {STAT_LABELS[stat]}: base {base}
                  {advances > 0 ? `, +${advances} advance(s)` : ""}
                </li>
              ))}
          </ul>
        )}
      </Section>

      <Section title="Skills">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="hud-label mb-2 text-hud-gold">Starting skills</h3>
            {startingSkills.length === 0 ? (
              <p className="text-hud-mute">None</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {startingSkills.map((skill) => (
                  <li key={skill.type}>
                    <Chip>{skill.type}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="hud-label mb-2 text-hud-gold">Gained skills</h3>
            {gainedSkills.length === 0 ? (
              <p className="text-hud-mute">None</p>
            ) : (
              <ul className="space-y-1.5">
                {gainedSkills.map((skill) => {
                  const advancement = (player.advancements ?? []).find(
                    (candidate) => candidate.name === skill.type
                  );
                  return (
                    <li key={skill.type}>
                      <Chip tone="skill">{skill.type}</Chip>
                      {advancement && (
                        <span className="ml-2 text-hud-sm text-hud-dim">
                          ({advancement.type.replace("-", " ")}, {" "}
                          {advancement.sppCost} SPP
                          {advancement.elite ? ", elite" : ""})
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </Section>

      <Section title="Injuries">
        {player.injuries.length === 0 ? (
          <p className="text-hud-mute">No permanent injuries.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {player.injuries.map((injury, index) => (
              <li key={`${injury}-${index}`}>
                <Chip tone="bad">{injury}</Chip>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="SPP & career statistics">
        <p className="mb-3 text-hud-base text-hud-bone">
          {player.spp} SPP available
          {required && (
            <span className="ml-2 font-bold text-hud-blood-hot">
              — must advance
            </span>
          )}
        </p>
        {player.careerStats ? (
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
            <Stat label="Matches" value={player.careerStats.matches} />
            <Stat label="Completions" value={player.careerStats.completions} />
            <Stat
              label="Interceptions"
              value={player.careerStats.interceptions}
            />
            <Stat label="Casualties" value={player.careerStats.casualties} />
            <Stat label="Touchdowns" value={player.careerStats.touchdowns} />
            <Stat label="MVPs" value={player.careerStats.mvps} />
          </div>
        ) : (
          <p className="text-hud-mute">
            This player has not appeared in a recorded match yet.
          </p>
        )}
        <p className="mt-3 text-hud-sm text-hud-mute">
          Provenance: {player.playerKind ?? "roster"} player
          {team.seedMetadata ? " (development seed data)" : ""}
        </p>
      </Section>

      <Section title="Pending development" accent={required ? "blood" : undefined}>
        {!eligible ? (
          <p className="text-hud-mute">
            Not enough SPP to advance yet.
          </p>
        ) : (
          <PlayerDevelopment
            player={player}
            team={team}
            rngService={rngService}
            onApplied={() => {
              // Keep Manage Team's pending-development queue consistent
              // with an advancement applied from this page directly —
              // otherwise a resolved entry lingers and blocks the team's
              // next required fixture (team-advancement-modes).
              if (!mustAdvance(player)) {
                team.pendingDevelopment = (
                  team.pendingDevelopment ?? []
                ).filter(
                  (entry) =>
                    !(
                      entry.kind === "advanced-league-advancement" &&
                      entry.playerId === player.id
                    )
                );
              }
              saveTeam(team);
              refresh();
            }}
          />
        )}
      </Section>
    </PageShell>
  );
}

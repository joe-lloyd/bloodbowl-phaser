import { useCallback, useState } from "react";
import { Chip, Stat } from "../../src/ui/components/componentWarehouse/HudBits";
import { Section } from "../../src/ui/components/componentWarehouse/HudPage";
import type { HudTone } from "../../src/ui/components/componentWarehouse/hudTone";
import type { MatchType } from "../../src/game/variants/gameTypes";
import type { RosterName } from "../../src/types/Team";
import { api } from "../boundary/client";
import {
  MATCH_TYPES,
  type TeamView,
  type ToolOutput,
} from "../boundary/schemas";
import { Choice } from "./choices";
import { formatNumber, MATCH_TYPE_LABELS } from "./text";
import { Loaded } from "./Loaded";
import { useLoad } from "./useLoad";

type Position = TeamView["positions"][number];
type Use = Position["skills"][number]["use"];

const USE: Record<Use, { tone: HudTone; label: string; meaning: string }> = {
  chooses: {
    tone: "good",
    label: "Chooses",
    meaning: "the coach plans when to use it",
  },
  prices: {
    tone: "info",
    label: "Prices",
    meaning: "counted in the coach's odds or values",
  },
  engine: {
    tone: "neutral",
    label: "Engine",
    meaning: "the rules apply it; the coach leaves it out",
  },
  ignores: {
    tone: "bad",
    label: "Ignores",
    meaning: "a choice or risk the coach never weighs",
  },
};
const USES: readonly Use[] = ["chooses", "prices", "engine", "ignores"];
const MATCH_OPTIONS = MATCH_TYPES.map((value) => ({
  value,
  label: MATCH_TYPE_LABELS[value],
}));
const STATS = ["MA", "ST", "AG", "PA", "AV"] as const;
const loadTeams = () => api.listTeams({});

function Legend() {
  return (
    <ul className="mb-5 grid gap-2 text-hud-sm text-hud-dim sm:grid-cols-2">
      {USES.map((use) => (
        <li key={use}>
          <Chip tone={USE[use].tone}>{USE[use].label}</Chip> {USE[use].meaning}
        </li>
      ))}
    </ul>
  );
}

function PositionCard({ position }: { position: Position }) {
  const stat = (name: (typeof STATS)[number]) => {
    const value = position.stats[name];
    if (name === "PA" && value === 0) return "–";
    return name === "AG" || name === "PA" ? `${String(value)}+` : String(value);
  };
  return (
    <Section
      title={position.name}
      aside={
        <span className="text-hud-xs text-hud-mute">{`${String(position.cost / 1000)}k · up to ${String(position.maxAllowed ?? "any")}`}</span>
      }
      className="mb-0"
    >
      <div className="mb-3 flex gap-2">
        {STATS.map((name) => (
          <Stat key={name} label={name} value={stat(name)} />
        ))}
      </div>
      <ul className="space-y-2">
        {position.skills.map((skill) => (
          <li key={skill.name}>
            <span className="font-hud-label font-bold">{skill.name}</span>{" "}
            <Chip tone={USE[skill.use].tone}>{USE[skill.use].label}</Chip>
            <p className="text-hud-xs text-hud-mute">{skill.note}</p>
          </li>
        ))}
        {position.skills.length === 0 && (
          <li className="text-hud-sm text-hud-mute">No skills</li>
        )}
      </ul>
    </Section>
  );
}

function Builds({ builds }: { builds: TeamView["builds"] }) {
  return (
    <Section title="Computer teams" className="mb-0">
      {builds.map((b) => (
        <p key={b.name} className="mb-2 text-hud-sm">
          <span className="font-bold">{b.name}</span>{" "}
          <span className="text-hud-mute">({b.build})</span>
          <br />
          <span className="text-hud-dim">
            {b.players
              .map((p) => `${String(p.count)} ${p.position}`)
              .join(", ")}
          </span>
        </p>
      ))}
      {builds.length === 0 && (
        <p className="text-hud-sm text-hud-dim">
          No computer team uses this roster.
        </p>
      )}
    </Section>
  );
}

function TeamDetail({ team }: { team: TeamView }) {
  const { draft } = team;
  return (
    <>
      <p className="mb-4 text-hud-sm text-hud-dim">
        Tier {team.tier} · re-rolls {formatNumber(team.rerollCost / 1000)}k ·{" "}
        {team.apothecary ? "apothecary" : "no apothecary"}
        {team.specialRules.map((rule) => ` · ${rule}`).join("")}
      </p>
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {team.positions.map((position) => (
          <PositionCard key={position.name} position={position} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Weights for this team" className="mb-0">
          {team.weights.length === 0 && (
            <p className="text-hud-sm text-hud-dim">
              Plays on the default weights.
            </p>
          )}
          {team.weights.map((w) => (
            <p key={w.name}>
              {w.label}{" "}
              <span className="text-hud-gold">{formatNumber(w.value)}</span>{" "}
              <Chip tone="gold">{w.setBy}</Chip>
            </p>
          ))}
        </Section>
        <Builds builds={team.builds} />
        <Section
          title={`Draft in ${MATCH_TYPE_LABELS[team.matchType]}`}
          className="mb-0"
        >
          <p className="text-hud-sm text-hud-dim">
            {formatNumber(draft.budget / 1000)}k budget, {draft.minPlayers} to{" "}
            {draft.maxPlayers} players,{" "}
            {draft.maxNonLinemen === null
              ? "any number of"
              : `at most ${String(draft.maxNonLinemen)}`}{" "}
            non-linemen.
          </p>
        </Section>
      </div>
    </>
  );
}

function TeamPicker({
  teams,
  matchType,
}: {
  teams: ToolOutput<"list_teams">["teams"];
  matchType: MatchType;
}) {
  const [roster, setRoster] = useState<RosterName>("Halfling");
  const load = useCallback(
    () => api.getTeam({ roster, matchType }),
    [roster, matchType]
  );
  const { state } = useLoad(load);
  const options = teams.map((t) => ({
    value: t.roster,
    label: `${t.roster}${t.secret ? " (secret league)" : ""} · tier ${String(t.tier)}${t.ignored > 0 ? ` · ${String(t.ignored)} ignored` : ""}`,
  }));
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Choice
          label="Team"
          value={roster}
          options={options}
          onChange={setRoster}
        />
      </div>
      <Loaded state={state}>{(team) => <TeamDetail team={team} />}</Loaded>
    </>
  );
}

export function TeamsScreen() {
  const [matchType, setMatchType] = useState<MatchType>("sevens");
  const { state } = useLoad(loadTeams);
  return (
    <>
      <Legend />
      <div className="mb-2 flex flex-wrap items-end gap-3">
        <Choice
          label="Game type"
          value={matchType}
          options={MATCH_OPTIONS}
          onChange={setMatchType}
        />
      </div>
      <Loaded state={state}>
        {({ teams }) => <TeamPicker teams={teams} matchType={matchType} />}
      </Loaded>
    </>
  );
}

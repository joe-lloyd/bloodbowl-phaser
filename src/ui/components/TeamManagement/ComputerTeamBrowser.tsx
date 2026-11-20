import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getComputerTeamTemplates,
  createComputerTeamFromTemplate,
} from "../../../competition/computerTeamTemplates";
import { getAvailableRosterNames } from "../../../data/RosterTemplates";
import {
  DEFAULT_SEVENS_RULESET,
  type SevensRuleset,
} from "../../../game/rules/sevensRuleset";
import { SevensRulesetSelector } from "../common/SevensRulesetSelector";
import { PlayerPortrait } from "../common/PlayerPortrait";
import {
  Chip,
  EmptyState,
  Field,
  HudButton,
  Panel,
  Stat,
} from "../componentWarehouse/HudKit";
import { formatGold, numToHex } from "./TeamStatsOverview";

export function ComputerTeamBrowser() {
  const [query, setQuery] = useState("");
  const [roster, setRoster] = useState("");
  const [ruleset, setRuleset] = useState<SevensRuleset>(DEFAULT_SEVENS_RULESET);
  const navigate = useNavigate();
  const friendlyIds = useMemo(
    () => new Set(getComputerTeamTemplates().map((template) => template.id)),
    []
  );
  const entries = useMemo(
    () =>
      getComputerTeamTemplates({ ruleset }).map((template) => ({
        template,
        preview: createComputerTeamFromTemplate(template.id, { ruleset }),
      })),
    [ruleset]
  );
  const matches = entries.filter(
    ({ template }) =>
      (!roster || template.rosterName === roster) &&
      `${template.name} ${template.rosterName} ${template.buildName}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
  );
  return (
    <div className="space-y-5">
      <p className="max-w-3xl font-hud-body text-hud-base text-hud-dim">
        Ready for everyone. Each match or competition starts with a fresh copy.
        League teams develop through the season; these starting rosters stay the
        same.
      </p>
      <div className="grid items-start gap-4 md:grid-cols-3">
        <Field label="Find a computer team">
          <input
            className="hud-field"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="Name, roster, or build"
          />
        </Field>
        <Field label="Roster">
          <select
            className="hud-field"
            value={roster}
            onChange={(event) => {
              setRoster(event.target.value);
            }}
          >
            <option value="">All rosters</option>
            {getAvailableRosterNames().map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <SevensRulesetSelector value={ruleset} onChange={setRuleset} />
      </div>
      <p className="hud-label text-hud-mute" role="status">
        {matches.length} of {entries.length} computer teams
      </p>
      {matches.length === 0 && (
        <EmptyState title="No computer teams match your search." />
      )}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {matches.map(({ template, preview }) => (
          <Panel
            key={template.id}
            accent={{ color: numToHex(template.colors.primary) }}
            className="flex flex-col gap-4 p-4"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="hud-label">{template.rosterName}</span>
                <Chip>Starting roster</Chip>
              </div>
              <h3 className="mt-2 break-words font-hud-display text-hud-2xl uppercase text-hud-bone">
                {template.name}
              </h3>
              <p className="mt-1 font-hud-body text-hud-sm text-hud-dim">
                {template.buildName}
              </p>
            </div>
            <div
              className="flex flex-wrap justify-center gap-1 rounded-hud border border-white/10 bg-black/40 p-3"
              aria-label={`${template.name} starting lineup`}
            >
              {preview.players.slice(0, 7).map((player) => (
                <PlayerPortrait
                  key={player.id}
                  rosterName={template.rosterName}
                  positionName={player.positionName}
                  colors={preview.colors}
                  size={36}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat
                label="Team value"
                value={formatGold(preview.teamValue)}
                tone="gold"
              />
              <Stat label="Players" value={preview.players.length} />
              <Stat label="Rerolls" value={preview.rerolls} />
            </div>
            <details className="font-hud-body text-hud-sm text-hud-dim">
              <summary className="cursor-pointer text-hud-bone">
                View roster and source
              </summary>
              <ul className="my-3 space-y-1">
                {template.players.map(([position, count]) => (
                  <li key={position}>
                    {count} × {position}
                  </li>
                ))}
              </ul>
              <p>
                Unspent gold: {formatGold(preview.treasury)}. One Lineman is the
                Veteran.
              </p>
              <a
                className="mt-2 inline-block text-hud-gold underline"
                href={template.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Bonehead Podcast guide ↗
              </a>
            </details>
            <div className="mt-auto flex flex-wrap gap-2">
              <HudButton
                variant="primary"
                disabled={!friendlyIds.has(template.id)}
                title={
                  !friendlyIds.has(template.id)
                    ? "This roster needs a league using the NAF rulings."
                    : undefined
                }
                onClick={() =>
                  navigate(
                    `/select-team?computer=${encodeURIComponent(template.id)}`
                  )
                }
              >
                Play against
              </HudButton>
              <HudButton
                onClick={() =>
                  navigate(
                    `/leagues/new?computer=${encodeURIComponent(template.id)}&ruleset=${ruleset}`
                  )
                }
              >
                Add to a league
              </HudButton>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

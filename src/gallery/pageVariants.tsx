/**
 * Gallery variants for the pages around the match: the real page
 * components on seeded demo data, routed in memory. Seeding is
 * deterministic, so every iframe sees the same teams and competitions.
 */
import React, { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Variant } from "./variants";
import { seedDevelopmentData } from "../seeding/runner";
import { seedCompetitionId, seedTeamId } from "../seeding/seedMeta";
import { loadTeams } from "../game/managers/TeamManager";
import { MainMenu } from "../ui/components/pages/MainMenu";
import { TeamManagement } from "../ui/components/pages/TeamManagement";
import { TeamBuilder } from "../ui/components/pages/TeamBuilder";
import { TeamSelect } from "../ui/components/pages/TeamSelect";
import { PlayerPage } from "../ui/components/pages/PlayerPage";
import { CompetitionHub } from "../ui/components/pages/CompetitionHub";
import { CompetitionView } from "../ui/components/pages/CompetitionView";
import { CompetitionBuilder } from "../ui/components/pages/CompetitionBuilder";
import { SharedTeamBrowser } from "../ui/components/pages/SharedTeamBrowser";
import { SettingsPanel } from "../ui/components/pages/OnlineLobby";
import {
  Chip,
  EmptyState,
  Field,
  HudButton,
  hudChoiceClass,
  Notice,
  PageHeader,
  PageShell,
  Section,
} from "../ui/components/componentWarehouse/HudKit";
import { DEFAULT_PITCH_THEME_ID } from "../game/presentation/pitchThemes";
import type { LobbySettings } from "../firebase/lobby";

const SECTION = "Pages";
const seed = () => void seedDevelopmentData();
const firstTeamId = () => loadTeams()[0]?.id ?? seedTeamId("missing");

/** One page at one URL, under the app's route pattern for that page. */
const at = (path: string, pattern: string, element: React.ReactNode) => (
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path={pattern} element={element} />
    </Routes>
  </MemoryRouter>
);

const page = (
  id: string,
  title: string,
  view: () => React.ReactNode,
  prepare: (() => void) | undefined = seed
): Variant => ({
  id: `page-${id}`,
  section: SECTION,
  title,
  stage: "page",
  prepare,
  view,
});

/** Every page primitive on one screen, for reviewing the kit itself. */
function PageKit() {
  const [picked, setPicked] = useState("Human Founders");
  return (
    <PageShell
      actionBar={
        <>
          <HudButton variant="ghost">Back</HudButton>
          <span className="hud-label">The sticky action bar</span>
          <HudButton variant="primary">Main action</HudButton>
        </>
      }
    >
      <PageHeader
        eyebrow="Eyebrow"
        title="Page header"
        subtitle="One line of context under the title. Actions sit on the right."
        back={{ label: "Back to Menu", onClick: () => {} }}
        actions={
          <>
            <HudButton>Secondary</HudButton>
            <HudButton variant="primary">Primary</HudButton>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Section" aside="Aside label">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Text field">
              <input className="hud-field" placeholder="Placeholder" />
            </Field>
            <Field label="Select" hint="A hint under the control.">
              <select className="hud-field">
                <option>Option one</option>
              </select>
            </Field>
          </div>
          <label className="mt-4 flex items-center gap-3 text-hud-base">
            <input type="checkbox" className="hud-check" defaultChecked />A
            checkbox with its label
          </label>
          <div className="mt-4 flex flex-col gap-2">
            {["Human Founders", "Orc Founders", "Dwarf Founders"].map((n) => (
              <button
                key={n}
                aria-pressed={picked === n}
                onClick={() => setPicked(n)}
                className={`${hudChoiceClass(picked === n)} px-3 py-2 font-hud-label font-bold uppercase`}
              >
                {n}
              </button>
            ))}
          </div>
        </Section>
        <div className="flex flex-col gap-4">
          <Notice tone="warn" title="Notice, warn">
            Not yet legal for play or competition entry.
          </Notice>
          <Notice tone="bad" role="alert">
            Give the competition a name.
          </Notice>
          <div className="flex flex-wrap gap-2">
            <Chip tone="gold">Active</Chip>
            <Chip>Draft</Chip>
            <Chip tone="blood">Illegal</Chip>
            <Chip tone="info">Advanced League</Chip>
            <Chip tone="good">Ready</Chip>
          </div>
          <EmptyState
            title="Nothing here yet"
            action={<HudButton variant="primary">Make the first one</HudButton>}
          >
            An empty list says so and offers the way forward.
          </EmptyState>
        </div>
      </div>
    </PageShell>
  );
}

function LobbySettingsDemo({ readOnly }: { readOnly: boolean }) {
  const [settings, setSettings] = useState<LobbySettings>({
    turnSeconds: 120,
    timeoutBankMs: 5 * 60 * 1000,
    pitchThemeId: DEFAULT_PITCH_THEME_ID,
    progressionEnabled: false,
  });
  return (
    <PageShell width="narrow">
      <SettingsPanel
        settings={settings}
        readOnly={readOnly}
        onChange={setSettings}
      />
    </PageShell>
  );
}

export const PAGE_VARIANTS: Variant[] = [
  page("kit", "The page kit", () => <PageKit />, undefined),
  page("menu", "Main menu", () => at("/", "/", <MainMenu />)),
  page("teams", "Team management", () =>
    at("/build-team", "/build-team", <TeamManagement />)
  ),
  page("builder", "Team builder", () =>
    at(`/build-team/${firstTeamId()}`, "/build-team/:teamId", <TeamBuilder />)
  ),
  page("player", "Player development", () => {
    const team = loadTeams()[0];
    return at(
      `/build-team/${team?.id}/player/${team?.players[0]?.id}`,
      "/build-team/:teamId/player/:playerId",
      <PlayerPage />
    );
  }),
  page("select", "Team selection", () =>
    at("/select-team", "/select-team", <TeamSelect mode="play" />)
  ),
  page("leagues", "Leagues", () =>
    at("/leagues", "/leagues", <CompetitionHub type="league" />)
  ),
  page("league", "A league", () =>
    at(
      `/leagues/${seedCompetitionId("league", "founders-league")}`,
      "/leagues/:id",
      <CompetitionView type="league" />
    )
  ),
  page("bracket", "A tournament bracket", () =>
    at(
      `/tournaments/${seedCompetitionId("tournament", "winter-gauntlet")}`,
      "/tournaments/:id",
      <CompetitionView type="tournament" />
    )
  ),
  page("new-tournament", "Create a tournament", () =>
    at(
      "/tournaments/new",
      "/tournaments/new",
      <CompetitionBuilder type="tournament" />
    )
  ),
  page("shared", "Other coaches, signed out", () =>
    at("/shared-teams", "/shared-teams", <SharedTeamBrowser />)
  ),
  page("lobby-settings", "Lobby match settings, host", () => (
    <LobbySettingsDemo readOnly={false} />
  )),
  page("lobby-settings-guest", "Lobby match settings, guest", () => (
    <LobbySettingsDemo readOnly />
  )),
];

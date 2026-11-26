import { type ReactNode, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { openOnlineCompetition } from "../../../competition/online";
import {
  type CompetitionType,
  competitionPath,
  type ComputerGames,
  type TournamentFormat,
} from "../../../competition/types";
import {
  DEFAULT_SEVENS_RULESET,
  type SevensRuleset,
} from "../../../game/rules/sevensRuleset";
import type { Difficulty } from "../../../simulation/ai/difficulty";
import { errorText } from "../../errorText";
import { useTeamLibrary } from "../../hooks/useTeamLibrary";
import { SevensRulesetSelector } from "../common/SevensRulesetSelector";
import { GameTypeSelector } from "../common/GameTypeSelector";
import {
  DEFAULT_GAME_TYPE,
  type GameType,
} from "../../../game/variants/gameTypes";
import { draftRulesFor } from "../../../game/rules/draftRules";
import {
  Field,
  HudButton,
  Notice,
  PageHeader,
  PageShell,
  Section,
} from "../componentWarehouse/HudKit";
import { DifficultyPicker } from "./DifficultyPicker";
import {
  DEFAULT_PROFILE_CHOICE,
  type ProfileChoice,
  profileFrom,
} from "./profileChoice";
import { RosterProfileSection } from "./RosterProfileSection";

const PLACES: Record<CompetitionType, readonly number[]> = {
  league: [4, 6, 8, 10, 12, 16],
  tournament: [4, 8, 16],
};

const PACES: readonly { days: number; label: string }[] = [
  { days: 1, label: "A round every day" },
  { days: 3.5, label: "Two rounds a week" },
  { days: 7, label: "One round a week" },
  { days: 14, label: "One round every two weeks" },
];

const FORMATS: readonly { id: TournamentFormat; label: string }[] = [
  { id: "single-elimination", label: "Single elimination" },
  { id: "round-robin", label: "Round robin" },
];

interface Settings {
  name: string;
  format: TournamentFormat;
  ruleset: SevensRuleset;
  gameType: GameType;
  profile: ProfileChoice;
  places: number;
  roundDays: number;
  computerGames: ComputerGames;
  listed: boolean;
  difficulty: Difficulty;
  teamId: string;
}

type Update = (patch: Partial<Settings>) => void;

function initialSettings(): Settings {
  return {
    name: "",
    format: "single-elimination",
    ruleset: DEFAULT_SEVENS_RULESET,
    gameType: DEFAULT_GAME_TYPE,
    profile: DEFAULT_PROFILE_CHOICE,
    places: 8,
    roundDays: 7,
    computerGames: "simulate",
    listed: true,
    difficulty: "standard",
    teamId: "",
  };
}

function Details({ type, settings, update }: { type: CompetitionType; settings: Settings; update: Update }) {
  return (
    <Section title="Details">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <input value={settings.name} maxLength={60} onChange={(event) => { update({ name: event.target.value }); }} className="hud-field" />
        </Field>
        {type === "tournament" && (
          <Field label="Format">
            <select
              value={settings.format}
              onChange={(event) => {
                const format = FORMATS.find((option) => option.id === event.target.value);
                if (format) update({ format: format.id });
              }}
              className="hud-field"
            >
              {FORMATS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </Section>
  );
}

function Schedule({ type, settings, update }: { type: CompetitionType; settings: Settings; update: Update }) {
  return (
    <Section title="Online play">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Places" hint="Computer teams fill any place still empty when you start.">
          <select aria-label="Places" value={settings.places} onChange={(event) => { update({ places: Number(event.target.value) }); }} className="hud-field">
            {PLACES[type].map((places) => (
              <option key={places} value={places}>{places} teams</option>
            ))}
          </select>
        </Field>
        <Field label="Pace" hint="Each round has this long. The next round opens early once every game in it is played.">
          <select aria-label="Pace" value={settings.roundDays} onChange={(event) => { update({ roundDays: Number(event.target.value) }); }} className="hud-field">
            {PACES.map((pace) => (
              <option key={pace.days} value={pace.days}>{pace.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <label className="mt-4 flex items-start gap-3 font-hud-body text-hud-base text-hud-bone">
        <input type="checkbox" className="hud-check mt-0.5" checked={settings.computerGames === "simulate"} onChange={(event) => { update({ computerGames: event.target.checked ? "simulate" : "play" }); }} />
        Simulate games between two computer teams as soon as their round opens. Untick to play or simulate them yourself.
      </label>
      <label className="mt-3 flex items-start gap-3 font-hud-body text-hud-base text-hud-bone">
        <input type="checkbox" className="hud-check mt-0.5" checked={settings.listed} onChange={(event) => { update({ listed: event.target.checked }); }} />
        List it under Open for sign-up so any coach can find it. Untick to share it only by link or invite.
      </label>
      <DifficultyPicker value={settings.difficulty} onChange={(difficulty) => { update({ difficulty }); }} />
    </Section>
  );
}

function Rules({ settings, update }: { settings: Settings; update: Update }) {
  return (
    <Section title="Rules for this competition">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <GameTypeSelector
            label="Game type"
            value={settings.gameType}
            onChange={(gameType) => {
              update({
                gameType,
                profile: {
                  ...settings.profile,
                  draftBudget: draftRulesFor(gameType).budget,
                },
              });
            }}
          />
        </div>
        {settings.gameType === DEFAULT_GAME_TYPE && (
          <SevensRulesetSelector value={settings.ruleset} onChange={(ruleset) => { update({ ruleset }); }} />
        )}
      </div>
    </Section>
  );
}

function OrganizerTeam({ settings, update }: { settings: Settings; update: Update }) {
  const [library] = useTeamLibrary();
  const teams = library.filter((team) => !team.computerCoached && !team.activeCompetitionId);
  return (
    <Section title="Your team">
      <select aria-label="Your team" value={settings.teamId} onChange={(event) => { update({ teamId: event.target.value }); }} className="hud-field !w-72">
        <option value="">Organize without entering a team</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>{team.name} ({team.rosterName})</option>
        ))}
      </select>
    </Section>
  );
}

export function OnlineCompetitionBuilder({ type, uid, modeSwitch }: { type: CompetitionType; uid: string; modeSwitch: ReactNode }) {
  const navigate = useNavigate();
  const [library] = useTeamLibrary();
  const [settings, setSettings] = useState(initialSettings);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const pending = useRef(false);
  const update: Update = (patch) => {
    setSettings((current) => ({ ...current, ...patch }));
  };

  const open = () => {
    if (pending.current) return;
    pending.current = true;
    setOpening(true);
    setError(null);
    const profile = profileFrom(settings.profile);
    openOnlineCompetition({
      type,
      name: settings.name,
      format: settings.format,
      ruleset: settings.ruleset,
      gameType: settings.gameType,
      computerDifficulty: settings.difficulty,
      organizerUid: uid,
      team: library.find((team) => team.id === settings.teamId) ?? null,
      online: { places: settings.places, listed: settings.listed, roundDays: settings.roundDays, computerGames: settings.computerGames },
      ...(profile && { profile }),
    })
      .then((competition) => navigate(competitionPath({ competitionType: competition.type, competitionId: competition.id })))
      .catch((reason: unknown) => {
        setError(errorText(reason));
      })
      .finally(() => {
        pending.current = false;
        setOpening(false);
      });
  };

  return (
    <PageShell
      width="medium"
      actionBar={
        <>
          <HudButton variant="ghost" onClick={() => void navigate(-1)}>Cancel</HudButton>
          {error && <Notice tone="bad" role="alert" className="order-last w-full py-2 sm:order-none sm:w-auto sm:flex-1">{error}</Notice>}
          <HudButton variant="primary" disabled={opening} onClick={open}>Open sign-ups</HudButton>
        </>
      }
    >
      <PageHeader title={`Create ${type}`} />
      {modeSwitch}
      <Details type={type} settings={settings} update={update} />
      <Rules settings={settings} update={update} />
      <RosterProfileSection value={settings.profile} onChange={(profile) => { update({ profile }); }} />
      <Schedule type={type} settings={settings} update={update} />
      <OrganizerTeam settings={settings} update={update} />
    </PageShell>
  );
}

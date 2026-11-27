import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { RosterName } from "../../../types/Team";
import { foundClub } from "../../../game/rules/club";
import { saveTeam } from "../../../game/managers/TeamManager";
import { errorText } from "../../errorText";
import {
  Field,
  HudButton,
  Notice,
  PageHeader,
  PageShell,
  Section,
} from "../componentWarehouse/HudKit";
import { RosterPicker } from "../TeamBuilder/RosterPicker";

function useStillOnPage() {
  const onPage = useRef(true);
  useEffect(
    () => () => {
      onPage.current = false;
    },
    []
  );
  return onPage;
}

export function ClubFounding() {
  const navigate = useNavigate();
  const [name, setName] = useState("New Club");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const onPage = useStillOnPage();

  const found = async (rosterName: RosterName) => {
    if (saving) return;
    setSaving(true);
    const club = foundClub(name.trim() || "New Club", rosterName);
    try {
      await saveTeam(club);
      if (onPage.current)
        await navigate(`/build-team/${club.id}?returnTo=/clubs/${club.id}`);
    } catch (cause) {
      setError(`The club could not be saved. ${errorText(cause)}`);
      setSaving(false);
    }
  };

  return (
    <PageShell
      actionBar={
        <HudButton variant="ghost" onClick={() => void navigate("/clubs")}>
          Cancel
        </HudButton>
      }
    >
      <PageHeader
        title="FOUND A CLUB"
        subtitle="Draft a standard 600k Sevens team. That team is your Core Sevens squad, and it plays Street Bowl and Beach Bowl too. Every league and tournament game earns Star Player Points, so injuries, skills and deaths follow each player into every game type. Its career runs through the club league, one season at a time. A friendly keeps only the SPP you choose to count."
      />
      <Section title="Club name">
        <Field label="Name">
          <input
            className="hud-field"
            value={name}
            maxLength={40}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </Field>
      </Section>
      <Section title="Rosters">
        <RosterPicker onChoose={(roster) => void found(roster)} />
      </Section>
      {error && (
        <Notice tone="bad" role="alert">
          {error}
        </Notice>
      )}
    </PageShell>
  );
}

import { useState } from "react";
import { characterProblem, saveCharacter, startExport, startPreview, type Character, type StudioState } from "../boundary/studio";
import { HudButton } from "../../src/ui/components/componentWarehouse/HudButton";
import { Notice, Section } from "../../src/ui/components/componentWarehouse/HudKit";
import { BasicsEditor, BuildEditor, MotionEditor } from "./BodyEditor";
import { controlledKeys, inheritedLayout, usableFields, type Change } from "./character";
import { FieldRows } from "./FieldRows";
import { LooksEditor } from "./LooksEditor";
import { NewCharacter } from "./NewCharacter";
import { RenderPane, type Kit } from "./RenderPane";
import { UsedBy } from "./UsedBy";
import { useStudio } from "./useStudio";

function Editor({ state, character, onChange }: { readonly state: StudioState; readonly character: Character; readonly onChange: Change }) {
  const editing = { catalog: state.catalog, character, onChange };
  return (
    <>
      <BasicsEditor {...editing} />
      <Section title="Colours and parts">
        <FieldRows
          catalog={state.catalog}
          fields={usableFields(state.catalog, character)}
          inherited={inheritedLayout(state.catalog, character)}
          layout={character.layout}
          locked={controlledKeys(state.catalog, character)}
          onChange={(layout) => { onChange({ layout }); }}
        />
      </Section>
      <LooksEditor {...editing} />
      <BuildEditor {...editing} />
      <MotionEditor {...editing} />
      <UsedBy positions={state.positions} character={character} onChange={onChange} />
    </>
  );
}

function initialKey(): string {
  return window.location.hash.slice(1);
}

interface WorkbenchProps {
  readonly studio: ReturnType<typeof useStudio>;
  readonly state: StudioState;
}

function CharacterList({ state, selected, onSelect }: { readonly state: StudioState; readonly selected: string; readonly onSelect: (key: string) => void }) {
  return (
    <Section title="Characters" bodyClassName="flex flex-col gap-1">
      {state.characters.length === 0 && <p className="text-hud-sm text-hud-mute">None yet.</p>}
      {state.characters.map(({ key, label }) => (
        <HudButton key={key} size="sm" variant={key === selected ? "selected" : "ghost"} block onClick={() => { onSelect(key); }}>{label}</HudButton>
      ))}
    </Section>
  );
}

function useSave(studio: WorkbenchProps["studio"], onSaved: (edited: Character) => void) {
  const [saving, setSaving] = useState(false);
  const save = async (edited: Character) => {
    setSaving(true);
    await studio.attempt(async () => {
      await saveCharacter(edited);
      await studio.reload();
      onSaved(edited);
    });
    setSaving(false);
  };
  return { saving, save };
}

function Workbench({ studio, state }: WorkbenchProps) {
  const [selected, setSelected] = useState(initialKey);
  const [draft, setDraft] = useState<Character | null>(null);
  const [kit, setKit] = useState<Kit>({ primary: "#2a4ac8", secondary: "#e8c84a" });
  const saved = state.characters.find((entry) => entry.key === selected);
  const character = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  const problem = character ? characterProblem(character) : null;
  const open = (key: string, next: Character | null) => {
    if (dirty && !window.confirm("Leave without saving this character?")) return;
    window.history.replaceState(null, "", `#${key}`);
    setSelected(key);
    setDraft(next);
  };
  const { saving, save } = useSave(studio, (edited) => {
    setDraft((current) => (current === edited ? null : current));
  });
  const taken = [...state.models, ...state.catalog.models.map((model) => model.key)];
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside>
        <CharacterList state={state} selected={selected} onSelect={(key) => { open(key, null); }} />
        <NewCharacter catalog={state.catalog} taken={taken} onCreate={(next) => { open(next.key, next); }} />
      </aside>
      {character && (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
          <div className="min-w-0 xl:sticky xl:top-4">
            <RenderPane
              state={state}
              character={character}
              job={studio.job}
              active={studio.active || problem !== null}
              dirty={dirty}
              kit={kit}
              onKit={setKit}
              onPreview={() => void studio.attempt(async () => { studio.setJob(await startPreview({ character, ...kit })); })}
              onExport={() => void studio.attempt(async () => { studio.setJob(await startExport(character.key)); })}
            />
          </div>
          <div className="min-w-0">
            <div className="sticky top-0 z-10 mb-3 flex items-center gap-3 bg-hud-ink py-2">
              <HudButton
                variant="primary"
                disabled={saving || !dirty || problem !== null}
                onClick={() => void save(character)}
              >
                Save
              </HudButton>
              <HudButton variant="ghost" disabled={!dirty} onClick={() => { setDraft(null); }}>Discard</HudButton>
            </div>
            {problem && <Notice tone="bad" role="alert" className="mb-3">{problem}</Notice>}
            <Editor key={character.key} state={state} character={character} onChange={(patch) => { setDraft({ ...character, ...patch }); }} />
          </div>
        </div>
      )}
    </div>
  );
}

export function StudioApp() {
  const studio = useStudio();
  return (
    <main className="min-h-screen p-4 lg:p-6">
      <h1 className="mb-4 font-hud-display text-[28px] uppercase">Character studio</h1>
      {studio.error && <Notice tone="bad" role="alert" className="mb-4">{studio.error}</Notice>}
      {studio.state && Object.entries(studio.state.catalog.errors).map(([file, reason]) => (
        <Notice key={file} tone="bad" role="alert" className="mb-4" title={file}>{reason}</Notice>
      ))}
      {studio.state ? <Workbench studio={studio} state={studio.state} /> : <p className="text-hud-dim">Reading the models.</p>}
    </main>
  );
}

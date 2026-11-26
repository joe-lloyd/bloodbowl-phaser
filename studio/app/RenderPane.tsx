import { useState } from "react";
import type { Character, StudioJob, StudioState } from "../boundary/studio";
import { layeredArt, lookOptions } from "../../src/game/presentation/layered/layeredModels";
import type { PlayerAppearance } from "../../src/types/Player";
import { LayeredPortrait } from "../../src/ui/components/common/LayeredPortrait";
import { Input, Link } from "../../src/ui/components/common/NativeControls";
import { OptionCycler } from "../../src/ui/components/common/OptionCycler";
import { HudButton } from "../../src/ui/components/componentWarehouse/HudButton";
import { Notice, Section } from "../../src/ui/components/componentWarehouse/HudKit";

export interface Kit {
  readonly primary: string;
  readonly secondary: string;
}

interface RenderPaneProps {
  readonly state: StudioState;
  readonly character: Character;
  readonly job: StudioJob | null;
  readonly active: boolean;
  readonly dirty: boolean;
  readonly kit: Kit;
  readonly onKit: (kit: Kit) => void;
  readonly onPreview: () => void;
  readonly onExport: () => void;
}

const STATUS = { queued: "Waiting", running: "Rendering", done: "Done", failed: "Failed" } as const;

const PULL_REQUEST = "Pull request: ";

function JobLog({ job }: { readonly job: StudioJob }) {
  const pullRequest = job.log.find((line) => line.startsWith(PULL_REQUEST))?.slice(PULL_REQUEST.length);
  return (
    <Notice tone={job.status === "failed" ? "bad" : "neutral"} title={`${STATUS[job.status]}: ${job.kind} ${job.key}`} role="status">
      <pre className="hud-scroll max-h-48 overflow-auto whitespace-pre-wrap break-words text-hud-2xs">{job.log.join("\n")}</pre>
      {pullRequest && <Link href={pullRequest} target="_blank" rel="noreferrer" className="text-hud-gold underline">Open the pull request</Link>}
    </Notice>
  );
}

function colourNumber(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

function InGame({ character, kit }: { readonly character: Character; readonly kit: Kit }) {
  const [appearance, setAppearance] = useState<PlayerAppearance>({});
  const options = lookOptions(character.key);
  return (
    <Section title="In the game" aside="Last export">
      <div className="flex flex-wrap items-center gap-6">
        <LayeredPortrait
          model={character.key}
          label={character.label}
          appearance={appearance}
          colors={{ primary: colourNumber(kit.primary), secondary: colourNumber(kit.secondary) }}
          size={220}
          animate
          wholePixels
        />
        <div className="flex flex-col gap-2">
          {options.map((option) => (
            <OptionCycler
              key={option[0]}
              option={option}
              value={appearance[option[0]] ?? option[2][0]?.[0] ?? ""}
              onPick={(value) => { setAppearance({ ...appearance, [option[0]]: value }); }}
            />
          ))}
        </div>
      </div>
    </Section>
  );
}

function PreviewImage({ character, job }: { readonly character: Character; readonly job: StudioJob | null }) {
  const [missing, setMissing] = useState("");
  const finished = job?.kind === "preview" && job.key === character.key && job.status === "done" ? job.id : "last";
  const source = `/studio-api/image/${character.key}?${finished}`;
  if (missing === source) return <p className="text-hud-sm text-hud-mute">No preview yet. Press Preview to render one in Blender.</p>;
  return (
    <img src={source} alt={`Eight poses of ${character.label} in both kits`} className="w-full" style={{ imageRendering: "pixelated" }} onLoad={() => { setMissing(""); }} onError={() => { setMissing(source); }} />
  );
}

function KitPicker({ kit, onKit }: Pick<RenderPaneProps, "kit" | "onKit">) {
  return (
    <div className="flex items-center gap-2">
      <span className="hud-label">Team colours</span>
      <Input type="color" aria-label="Primary team colour" value={kit.primary} onChange={(event) => { onKit({ ...kit, primary: event.target.value }); }} />
      <Input type="color" aria-label="Secondary team colour" value={kit.secondary} onChange={(event) => { onKit({ ...kit, secondary: event.target.value }); }} />
    </div>
  );
}

export function RenderPane(props: RenderPaneProps) {
  const { state, character, job, active, dirty, kit } = props;
  return (
    <>
      <Section title="Preview" aside={`Blender on ${state.renderer}`}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <HudButton variant="primary" disabled={active} onClick={props.onPreview}>Preview</HudButton>
          <HudButton disabled={active || dirty} onClick={props.onExport}>Export to the game</HudButton>
          <KitPicker kit={kit} onKit={props.onKit} />
          {dirty && <span className="text-hud-sm text-hud-mute">Save before you export.</span>}
        </div>
        <PreviewImage character={character} job={job} />
        {job && <div className="mt-3"><JobLog job={job} /></div>}
        {job?.kind === "export" && job.status === "done" && (
          <HudButton size="sm" className="mt-3" disabled={dirty} onClick={() => { location.reload(); }}>Show the new art</HudButton>
        )}
      </Section>
      {layeredArt(character.key) && <InGame character={character} kit={kit} />}
    </>
  );
}

import { type ReactNode, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { DESIGN_TOKENS } from "../boundary/designTokens";
import { BloodBowlTable } from "../ui/components/componentWarehouse/BloodBowlTable";
import {
  Chip,
  DialogActions,
  DialogShell,
  DieFace,
  EmptyState,
  Eyebrow,
  Field,
  HudButton,
  type HudButtonSize,
  type HudButtonVariant,
  HudCoin,
  hudChoiceClass,
  HudTabs,
  type HudTone,
  Notice,
  PageHeader,
  Panel,
  PanelHeader,
  Section,
  Stat,
  TeamSwatch,
  KeyBadge,
} from "../ui/components/componentWarehouse/HudKit";
import { Tooltip } from "../ui/components/componentWarehouse/Tooltip";
import { Button, Input, Select } from "../ui/components/common/NativeControls";

const BUTTONS: readonly HudButtonVariant[] = [
  "primary",
  "selected",
  "secondary",
  "ghost",
  "danger",
];
const SIZES: readonly HudButtonSize[] = ["xs", "sm", "md", "lg"];
const TONES: readonly HudTone[] = [
  "gold",
  "blood",
  "good",
  "bad",
  "warn",
  "info",
  "skill",
  "neutral",
];

function Sheet({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6 bg-hud-ink p-6">{children}</div>;
}

function Line({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="hud-label w-28 shrink-0">{name}</span>
      {children}
    </div>
  );
}

export function ButtonSheet() {
  return (
    <Sheet>
      {BUTTONS.map((variant) => (
        <Line key={variant} name={variant}>
          {SIZES.map((size) => (
            <HudButton key={size} variant={variant} size={size}>
              {size}
            </HudButton>
          ))}
          <HudButton variant={variant} hotkey="y">
            hotkey
          </HudButton>
          <HudButton variant={variant} disabled>
            disabled
          </HudButton>
        </Line>
      ))}
      <Line name="block">
        <div className="w-72">
          <HudButton variant="primary" size="lg" block>
            Full width
          </HudButton>
        </div>
        <KeyBadge hotkey="Enter" />
      </Line>
    </Sheet>
  );
}

export function PanelSheet() {
  return (
    <Sheet>
      <div className="grid gap-4 sm:grid-cols-4">
        {TONES.map((tone) => (
          <Panel key={tone} accent={tone} className="p-3">
            <Eyebrow tone={tone}>{tone}</Eyebrow>
            <p className="text-hud-sm">Panel</p>
          </Panel>
        ))}
        <Panel className="p-3">
          <Eyebrow>No accent</Eyebrow>
          <p className="text-hud-sm">Panel</p>
        </Panel>
        <Panel accent={{ color: "#3d6fe0" }} className="p-3">
          <Eyebrow>Team colour</Eyebrow>
          <p className="text-hud-sm">Panel</p>
        </Panel>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Panel>
          <PanelHeader title="Title only" />
        </Panel>
        <Panel>
          <PanelHeader title="With an aside" aside="Aside" />
        </Panel>
        <Panel>
          <PanelHeader
            title="With controls"
            controls={
              <HudButton size="xs" variant="ghost">
                A+
              </HudButton>
            }
          />
        </Panel>
      </div>
      <Section title="Section" aside="Aside">
        A page section is a panel, a panel header and 16 pixels of padding.
      </Section>
      <BloodBowlTable title="Table" headers={["Player", "MA", "ST"]}>
        <tr>
          <td>Griff</td>
          <td>7</td>
          <td>4</td>
        </tr>
      </BloodBowlTable>
    </Sheet>
  );
}

function DialogSample({
  placement,
  tone,
  title,
}: {
  placement: "center" | "dock";
  tone: HudTone;
  title: string;
}) {
  return (
    <div className="relative h-[300px] w-[500px] max-w-full border border-dashed border-white/15">
      <div className={placement === "dock" ? "w-72" : "absolute inset-0"}>
        <DialogShell
          placement={placement}
          tone={tone}
          eyebrow={placement}
          title={title}
          actions={
            <DialogActions>
              <HudButton variant="ghost">No</HudButton>
              <HudButton variant="primary">Yes</HudButton>
            </DialogActions>
          }
        >
          One line that says what the coach has to choose.
        </DialogShell>
      </div>
    </div>
  );
}

export function DialogSheet() {
  return (
    <Sheet>
      <div className="flex flex-wrap gap-6">
        <DialogSample placement="center" tone="gold" title="Centred dialog" />
        <DialogSample placement="dock" tone="blood" title="Docked dialog" />
      </div>
    </Sheet>
  );
}

export function BitsSheet() {
  return (
    <Sheet>
      <Line name="Chip">
        {TONES.map((tone) => (
          <Chip key={tone} tone={tone}>
            {tone}
          </Chip>
        ))}
      </Line>
      <div className="grid gap-3 sm:grid-cols-2">
        {TONES.map((tone) => (
          <Notice key={tone} tone={tone} title={`Notice, ${tone}`}>
            A line of text under the title.
          </Notice>
        ))}
        <Notice tone="bad">A notice with no title.</Notice>
      </div>
      <Line name="Stat">
        <Stat label="MA" value="7" />
        <Stat label="ST" value="4" tone="good" />
        <Stat label="AG" value="3+" tone="bad" />
      </Line>
      <Line name="Small parts">
        <DieFace>5</DieFace>
        <TeamSwatch color="#3d6fe0" />
        <HudCoin spin={0} />
        <Tooltip content="A tooltip on hover or focus.">
          <span className="underline">Hover for a tooltip</span>
        </Tooltip>
      </Line>
      <EmptyState
        title="Empty state"
        action={<HudButton variant="primary">The way forward</HudButton>}
      >
        An empty list says so.
      </EmptyState>
    </Sheet>
  );
}

const TABS = [
  { id: "dice", label: "Dice" },
  { id: "chat", label: "Chat", count: 2 },
] as const;

function Choices() {
  const [picked, setPicked] = useState("Human");
  const [tab, setTab] = useState<"dice" | "chat">("dice");
  return (
    <>
      <Line name="Checkbox">
        <Input type="checkbox" className="hud-check" defaultChecked />
        <Input type="checkbox" className="hud-check" />
        <Input type="checkbox" className="hud-check" disabled />
      </Line>
      <Line name="Choice">
        {["Human", "Orc", "Dwarf"].map((name) => (
          <Button
            key={name}
            aria-pressed={picked === name}
            disabled={name === "Dwarf"}
            onClick={() => {
              setPicked(name);
            }}
            className={`${hudChoiceClass(picked === name)} px-4 py-2`}
          >
            {name}
          </Button>
        ))}
      </Line>
      <Line name="Tabs">
        <HudTabs
          label="Tabs"
          idBase="block-tabs"
          tabs={TABS}
          value={tab}
          onChange={setTab}
        />
      </Line>
    </>
  );
}

export function FormSheet() {
  return (
    <Sheet>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Text">
          <Input className="hud-field" defaultValue="Filled" />
        </Field>
        <Field label="Placeholder" hint="A hint under the control.">
          <Input className="hud-field" placeholder="Placeholder" />
        </Field>
        <Field label="Disabled">
          <Input className="hud-field" disabled defaultValue="Disabled" />
        </Field>
        <Field label="Number">
          <Input className="hud-field" type="number" defaultValue={3} />
        </Field>
        <Field label="Select">
          <Select className="hud-field">
            <option>Option one</option>
          </Select>
        </Field>
        <Field label="Select, disabled">
          <Select className="hud-field" disabled>
            <option>Option one</option>
          </Select>
        </Field>
      </div>
      <Choices />
    </Sheet>
  );
}

const typeScale = Object.entries(DESIGN_TOKENS.fontSize);
const families = Object.entries(DESIGN_TOKENS.fontFamily);

export function TypeSheet() {
  return (
    <Sheet>
      {typeScale.map(([name, [fontSize]]) => (
        <div key={name} className="flex items-baseline gap-4">
          <span className="hud-label w-28 shrink-0">
            {name} {fontSize}
          </span>
          {families.map(([family, stack]) => (
            <span
              key={family}
              className="w-72 truncate"
              style={{ fontSize, fontFamily: stack.join(',') }}
            >
              {family.replace("hud-", "")}
            </span>
          ))}
        </div>
      ))}
      <Line name="hud-label">
        <span className="hud-label">Small caps label</span>
        <Eyebrow tone="gold">Eyebrow</Eyebrow>
      </Line>
    </Sheet>
  );
}

const colours = Object.entries(DESIGN_TOKENS.colors.hud);
const spaces = Object.entries(DESIGN_TOKENS.spacing);

export function ColourSheet() {
  return (
    <Sheet>
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
        {colours.map(([name, value]) => (
          <div key={name}>
            <div
              className="h-12 rounded-hud border border-white/15"
              style={{ background: value }}
            />
            <p className="mt-1 text-hud-sm">{name}</p>
            <p className="text-hud-sm text-hud-dim">{value}</p>
          </div>
        ))}
      </div>
      {spaces.map(([name, value]) => (
        <Line key={name} name={`${name} ${value}`}>
          <div className="h-4 bg-hud-gold" style={{ width: value }} />
        </Line>
      ))}
    </Sheet>
  );
}

export function HeaderSheet() {
  return (
    <MemoryRouter>
      <Sheet>
        <PageHeader
          eyebrow="Eyebrow"
          title="Page header"
          subtitle="One line of context under the title."
          back={{ label: "Back to Menu", to: "/" }}
          actions={
            <>
              <HudButton>Secondary</HudButton>
              <HudButton variant="primary">Primary</HudButton>
            </>
          }
        />
      </Sheet>
    </MemoryRouter>
  );
}

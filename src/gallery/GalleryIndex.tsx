import { useState } from "react";
import { Input, Link } from "../ui/components/common/NativeControls";
import { Eyebrow } from "../ui/components/componentWarehouse/HudKit";
import { DriftFinding } from "./DriftFinding";
import { DRIFT } from "./drift";
import { Frame } from "./Frame";
import { type FrameSize, slug } from "./frames";
import { NOT_SHOWN } from "./notShown";
import { SizeSwitch } from "./SizeSwitch";
import { GROUPS, type Group, type Variant } from "./variant";
import { VARIANTS } from "./variants";

const DRIFT_TITLE = "Drift";
const NAV = [GROUPS[0], DRIFT_TITLE, ...GROUPS.slice(1), "Not shown"] as const;

function GroupTitle({ children }: { children: string }) {
  return (
    <h2
      id={slug(children)}
      className="mb-4 mt-14 scroll-mt-20 border-b border-hud-gold/30 pb-2 font-hud-display text-hud-2xl uppercase tracking-[0.03em]"
    >
      {children}
    </h2>
  );
}

function VariantCard({ variant, size }: { variant: Variant; size: FrameSize }) {
  return (
    <figure id={variant.id} className="min-w-0 scroll-mt-20">
      <figcaption className="mb-2 flex items-baseline justify-between gap-3">
        <span className="font-hud-label text-hud-base font-bold">
          {variant.title}
        </span>
        <Link
          href={`?show=${variant.id}&size=${size}`}
          className="hud-label shrink-0 hover:text-hud-gold"
        >
          Full size
        </Link>
      </figcaption>
      <Frame variant={variant} size={size} />
    </figure>
  );
}

function GroupSections({
  group,
  size,
  wanted,
}: {
  group: Group;
  size: FrameSize;
  wanted: readonly Variant[];
}) {
  const mine = wanted.filter((variant) => variant.group === group);
  if (mine.length === 0) return null;
  const sections = [...new Set(mine.map((variant) => variant.section))];
  return (
    <section>
      <GroupTitle>{group}</GroupTitle>
      {sections.map((section) => (
        <div key={section} className="mb-10">
          <h3 className="mb-3 font-hud-label text-hud-xl font-bold uppercase tracking-[0.04em] text-hud-gold">
            {section}
          </h3>
          <div
            className={
              mine.some((v) => v.section === section && v.stage === "sheet")
                ? "grid gap-6"
                : "grid gap-6 xl:grid-cols-2"
            }
          >
            {mine
              .filter((variant) => variant.section === section)
              .map((variant) => (
                <VariantCard key={variant.id} variant={variant} size={size} />
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function DriftSection({ size }: { size: FrameSize }) {
  return (
    <section>
      <GroupTitle>{DRIFT_TITLE}</GroupTitle>
      <p className="mb-6 max-w-3xl text-hud-base text-hud-dim">
        Each box is cut out of the live component, and the page measures the
        numbers under it as it loads. Nothing here is fixed yet. Pick what each
        one should be.
      </p>
      <div className="grid gap-10">
        {DRIFT.map((finding) => (
          <DriftFinding key={finding.id} finding={finding} size={size} />
        ))}
      </div>
    </section>
  );
}

function matching(text: string): Variant[] {
  const wanted = text.trim().toLowerCase();
  return VARIANTS.filter((variant) =>
    `${variant.section} ${variant.title} ${variant.id}`
      .toLowerCase()
      .includes(wanted)
  );
}

function Sidebar() {
  return (
    <nav className="hud-scroll sticky top-20 hidden h-[calc(100vh-6rem)] w-48 shrink-0 overflow-y-auto lg:block">
      <ul className="flex flex-col gap-0.5 font-hud-label text-hud-base font-semibold uppercase tracking-[0.04em]">
        {NAV.map((name) => (
          <li key={name}>
            <Link
              className="block rounded-hud px-2 py-1 text-hud-dim hover:bg-white/5 hover:text-hud-gold"
              href={`#${slug(name)}`}
            >
              {name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function TopBar({
  size,
  onSize,
  onFind,
}: {
  size: FrameSize;
  onSize: (size: FrameSize) => void;
  onFind: (text: string) => void;
}) {
  return (
    <div className="sticky top-0 z-50 border-b border-hud-gold/25 bg-hud-sunk/95 px-4 py-3 lg:px-8">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3">
        <span className="mr-auto hidden font-hud-display text-hud-lg uppercase sm:block">
          UI gallery
        </span>
        <div className="w-44">
          <Input
            className="hud-field"
            aria-label="Find a component"
            placeholder="Find a component"
            onChange={(event) => {
              onFind(event.target.value);
            }}
          />
        </div>
        <SizeSwitch size={size} onChange={onSize} />
      </div>
    </div>
  );
}

export function GalleryIndex() {
  const [size, setSize] = useState<FrameSize>("desktop");
  const [find, setFind] = useState("");
  const wanted = matching(find);
  return (
    <div
      data-variants={VARIANTS.map((v) => v.id).join(" ")}
      className="min-h-screen"
    >
      <TopBar size={size} onSize={setSize} onFind={setFind} />
      <div className="mx-auto flex max-w-[1500px] gap-8 px-4 py-8 lg:px-8">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <Eyebrow tone="gold">Blood Bowl Sevens</Eyebrow>
          <h1 className="mt-1 font-hud-display text-hud-3xl uppercase tracking-[0.02em]">
            Every component in one place
          </h1>
          <p className="mt-3 max-w-3xl text-hud-base text-hud-dim">
            {VARIANTS.length} states of the real components, with made-up teams.
            Every frame is live, so hover and click work. Switch the whole page
            between a desktop and a phone held sideways with the buttons at the
            top.
          </p>
          <GroupSections group={GROUPS[0]} size={size} wanted={wanted} />
          {find === "" && <DriftSection size={size} />}
          {GROUPS.slice(1).map((group) => (
            <GroupSections
              key={group}
              group={group}
              size={size}
              wanted={wanted}
            />
          ))}
          <GroupTitle>Not shown</GroupTitle>
          <ul className="mb-16 max-w-3xl list-disc pl-5 text-hud-base text-hud-dim">
            {NOT_SHOWN.map((line) => (
              <li key={line} className="mt-1">
                {line}
              </li>
            ))}
          </ul>
        </main>
      </div>
    </div>
  );
}

import { SECTIONS, VARIANTS } from "./variants";
import {
  Chip,
  Eyebrow,
  Panel,
} from "../ui/components/componentWarehouse/HudKit";

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const SKETCHES = [
  {
    file: "broadcast",
    name: "A: Stadium Broadcast",
    note: "Live sports TV graphics. Charcoal glass slabs, gold hairlines, blood red for the thing that matters, condensed type, skewed accents.",
    chosen: true,
  },
  {
    file: "ironclad",
    name: "B: Ironclad Dugout",
    note: "Riveted iron plates, engraved gold, blackletter headings and a parchment slip for rules text.",
  },
  {
    file: "chalk",
    name: "C: Chalk Talk",
    note: "The coach's tactics board. Slate green, chalk handwriting, dashed outlines.",
  },
];

/** Real-game captures, before (646081f) and after this redesign. */
const SHOTS = [
  { file: "setup", title: "Setup" },
  { file: "coin-toss", title: "Coin toss" },
  { file: "coin-toss-result", title: "Coin toss result" },
  { file: "action-menu", title: "A selected player and the action menu" },
  { file: "action-sequence", title: "The action sequence after choosing Move" },
  { file: "dodge-prompt", title: "A dodge prompt" },
  { file: "dice-tray", title: "The dice tray with a roll up" },
  { file: "block-dialog", title: "Block dialog before the roll" },
  { file: "block-dice", title: "Block dice up for a choice" },
  {
    file: "match-options",
    title: "Match options opened (before: it opened off the top of the screen)",
  },
];

const NOT_SHOWN = [
  "The dice log's chat tab and the online Waiting and Disconnected banners need a live online match; they use the same slab, label and button styles shown here.",
  "PlayerDevelopment lives on the Manage Team page, not in the match, so it keeps the menu styling.",
];

function Frame({
  id,
  height = 720,
  scale = 0.5,
}: {
  id: string;
  height?: number;
  scale?: number;
}) {
  return (
    <div
      className="overflow-hidden rounded-hud border border-white/10 bg-black"
      style={{ width: 1280 * scale, height: height * scale }}
    >
      <iframe
        title={id}
        src={`?v=${id}`}
        loading="lazy"
        width={1280}
        height={height}
        className="origin-top-left border-0"
        style={{ transform: `scale(${scale})` }}
      />
    </div>
  );
}

function SectionTitle({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      className="mb-4 mt-14 scroll-mt-6 border-b border-hud-gold/30 pb-2 font-hud-display text-hud-2xl uppercase tracking-[0.03em] text-hud-bone"
    >
      {children}
    </h2>
  );
}

export function GalleryIndex() {
  return (
    <div className="mx-auto flex max-w-[1400px] gap-10 px-8 py-10">
      <nav className="sticky top-6 hidden h-[calc(100vh-3rem)] w-52 shrink-0 overflow-y-auto hud-scroll lg:block">
        <Eyebrow tone="gold">Sections</Eyebrow>
        <ul className="mt-2 flex flex-col gap-0.5 font-hud-label text-[15px] font-semibold uppercase tracking-[0.04em]">
          {["Direction", "Before and after", ...SECTIONS, "Not shown"].map(
            (name) => (
              <li key={name}>
                <a
                  className="block rounded-hud px-2 py-1 text-hud-dim hover:bg-white/5 hover:text-hud-gold"
                  href={`#${slug(name)}`}
                >
                  {name}
                </a>
              </li>
            )
          )}
        </ul>
      </nav>

      <main className="min-w-0 flex-1">
        <header>
          <Eyebrow tone="gold">Blood Bowl Sevens · in-match HUD</Eyebrow>
          <h1 className="mt-1 font-hud-display text-hud-4xl uppercase tracking-[0.02em]">
            HUD redesign gallery
          </h1>
          <p className="mt-3 max-w-3xl text-hud-base text-hud-dim">
            Every floating React element in the match, on one design system. The
            variants below are the real components, rendered with fixture data
            and a real event bus over a pitch backdrop. Each frame is a live
            page: hover and click work.
          </p>
        </header>

        <SectionTitle id="direction">Direction</SectionTitle>
        <p className="mb-4 max-w-3xl text-hud-base text-hud-dim">
          Three cheap sketches of the same four elements: the score bar, a
          decision dialog, the dice tray and the log.
        </p>
        <div className="grid gap-5 xl:grid-cols-3">
          {SKETCHES.map((sketch) => (
            <Panel
              key={sketch.file}
              accent={sketch.chosen ? "gold" : undefined}
              className="p-3"
            >
              <div
                className="overflow-hidden rounded-hud"
                style={{ width: 384, height: 216 }}
              >
                <iframe
                  title={sketch.name}
                  src={`./sketches/${sketch.file}.html`}
                  width={1280}
                  height={720}
                  className="origin-top-left border-0"
                  style={{ transform: "scale(0.3)" }}
                />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <a
                  href={`./sketches/${sketch.file}.html`}
                  className="font-hud-label text-hud-lg font-bold uppercase tracking-[0.04em] hover:text-hud-gold"
                >
                  {sketch.name}
                </a>
                {sketch.chosen && <Chip tone="gold">Chosen</Chip>}
              </div>
              <p className="mt-1 text-hud-sm text-hud-dim">{sketch.note}</p>
            </Panel>
          ))}
        </div>
        <Panel accent="gold" className="mt-5 max-w-3xl p-5">
          <Eyebrow tone="gold">Why Stadium Broadcast</Eyebrow>
          <p className="mt-2 text-hud-base">
            It reads fastest over a busy pitch. Big plain numerals and a
            condensed label face keep scores, stats and target numbers legible
            at a glance, and the dark slabs sit back from the board instead of
            competing with it. Gold and blood red give it the Blood Bowl voice
            without ornament. Ironclad looked the part but its blackletter and
            heavy frames cost readability and space. Chalk Talk was light on the
            board but too casual, and handwriting slows down reading a dice
            result.
          </p>
          <p className="mt-3 text-hud-sm text-hud-dim">
            System: Anton for display, Barlow Condensed for labels and buttons,
            Barlow for body text. Tailwind tokens under <code>hud-*</code>;
            primitives in <code>componentWarehouse/HudKit.tsx</code> (Panel,
            PanelHeader, Eyebrow, HudButton, Chip, Stat, DieFace, DialogShell,
            DialogActions, HudCoin).
          </p>
        </Panel>

        <SectionTitle id="before-and-after">
          Before and after, in the real game
        </SectionTitle>
        <p className="mb-4 max-w-3xl text-hud-base text-hud-dim">
          Captured by <code>scripts/hud-shots</code> driving sandbox scenarios
          in the built game, at 1280 by 800. Left is the HUD before this work,
          right is after.
        </p>
        <div className="flex flex-col gap-8">
          {SHOTS.map((shot) => (
            <figure key={shot.file}>
              <figcaption className="mb-2 font-hud-label text-hud-lg font-bold uppercase tracking-[0.04em]">
                {shot.title}
              </figcaption>
              <div className="grid gap-3 lg:grid-cols-2">
                {(["before", "after"] as const).map((when) => (
                  <a
                    key={when}
                    href={`./shots/${when}/${shot.file}.jpg`}
                    className="group relative block"
                  >
                    <img
                      src={`./shots/${when}/${shot.file}.jpg`}
                      alt={`${shot.title}, ${when}`}
                      loading="lazy"
                      className="w-full rounded-hud border border-white/10 group-hover:border-hud-gold/60"
                    />
                    <Chip
                      tone={when === "after" ? "gold" : "neutral"}
                      className="absolute left-2 top-2 !bg-black/80"
                    >
                      {when}
                    </Chip>
                  </a>
                ))}
              </div>
            </figure>
          ))}
        </div>

        {SECTIONS.map((section) => (
          <section key={section}>
            <SectionTitle id={slug(section)}>{section}</SectionTitle>
            <div className="flex flex-wrap gap-6">
              {VARIANTS.filter((v) => v.section === section).map((v) => (
                <figure key={v.id}>
                  <Frame id={v.id} height={v.height} />
                  <figcaption className="mt-2 flex items-center gap-2">
                    <span className="font-hud-label text-[15px] font-bold uppercase tracking-[0.04em]">
                      {v.title}
                    </span>
                    <a
                      href={`?v=${v.id}`}
                      className="hud-label hover:text-hud-gold"
                    >
                      open
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ))}

        <SectionTitle id="not-shown">Not shown</SectionTitle>
        <ul className="mb-16 max-w-3xl list-disc pl-5 text-hud-base text-hud-dim">
          {NOT_SHOWN.map((line) => (
            <li key={line} className="mt-1">
              {line}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

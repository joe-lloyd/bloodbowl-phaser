import { loadPageManifest, type PageManifest } from "../boundary/pageManifest";
import { Link } from "../ui/components/common/NativeControls";
import React, { useEffect, useState } from "react";
import { Eyebrow, Panel } from "../ui/components/componentWarehouse/HudKit";
import { SketchCard, ShotLink } from "./GalleryKit";

const SKETCH_GROUPS = [
  {
    title: "Team selection",
    sketches: [
      { file: "team-select-a", name: "A: two benches", chosen: true },
      { file: "team-select-b", name: "B: one card grid" },
      { file: "team-select-c", name: "C: faceoff pickers" },
    ],
    why: "Two benches keeps one list per coach, so each coach scans and searches their own column, and the matchup reads left against right like a scoreboard. It also keeps the existing flow, where every team is a button in both columns. The card grid needs a hidden home then away order, and the faceoff pickers hide the list behind a dropdown, which is slower with thirty teams.",
  },
  {
    title: "Team roster",
    sketches: [
      { file: "roster-a", name: "A: broadcast table", chosen: true },
      { file: "roster-b", name: "B: player cards" },
      { file: "roster-c", name: "C: list and detail" },
    ],
    why: "Coaches compare players column by column: who is fastest, who has the armour. A table with one statline cell per stat in big numerals does that best, and rows keep drag to reorder and the hire buttons working as they do now. Cards look good with seven players but hide the comparison, and list and detail takes a click to see each player.",
  },
];

const PAGE_SHOTS = [
  ["menu", "Main menu"],
  ["menu-resume", "Main menu with a saved local match"],
  ["build-team-empty", "Teams page with no teams"],
  ["build-team", "Teams page with seeded teams"],
  ["team-builder-new", "Team builder, a new team"],
  ["team-builder", "Team builder, a seeded team"],
  ["team-builder-roster", "Team builder, the roster table"],
  ["player-page", "Player development"],
  ["player-not-found", "Player not found"],
  ["select-team-empty", "Team selection with fewer than two teams"],
  ["select-team", "Team selection"],
  ["select-team-picked", "Team selection, both teams picked"],
  ["select-team-no-match", "Team selection, a search with no match"],
  ["leagues-empty", "Leagues, none yet"],
  ["leagues", "Leagues"],
  ["league-new", "Create a league"],
  ["league-new-error", "Create a league, after Generate with no name"],
  ["league-view", "A league: entrants, standings and schedule"],
  ["tournaments", "Tournaments"],
  ["tournament-new", "Create a tournament"],
  ["tournament-bracket", "A tournament bracket after the semi-finals"],
  ["tournament-complete", "A finished tournament with its champion"],
  ["shared-teams-signed-out", "Other coaches, signed out"],
  ["online-host-signed-out", "Online lobby, signed out"],
  ["sound-test", "Sound test"],
] as const;



export const PAGES_NAV = ["Pages: direction", "Pages: before and after"] as const;

export function PagesReview({
  SectionTitle,
  slug,
}: {
  SectionTitle: (props: {
    id: string;
    children: React.ReactNode;
  }) => React.ReactElement;
  slug: (text: string) => string;
}) {
  const [manifest, setManifest] = useState<PageManifest | null>(null);
  useEffect(() => {
    loadPageManifest()
      .then(setManifest)
      .catch(() => {
        setManifest(null);
      });
  }, []);
  const has = (side: keyof PageManifest, name: string) =>
    manifest?.[side].includes(`${name}.jpg`) ?? false;

  return (
    <>
      <SectionTitle id={slug(PAGES_NAV[0])}>Pages: direction</SectionTitle>
      <p className="mb-4 max-w-3xl text-hud-base text-hud-dim">
        The pages around the match use the same kit as the HUD. Two layouts had
        no precedent, so each got three cheap sketches first.
      </p>
      {SKETCH_GROUPS.map((group) => (
        <div key={group.title} className="mb-8">
          <h3 className="mb-3 font-hud-label text-hud-xl font-bold uppercase tracking-[0.04em]">
            {group.title}
          </h3>
          <div className="grid gap-5 xl:grid-cols-3">
            {group.sketches.map((sketch) => (
              <SketchCard key={sketch.file} sketch={sketch} lazy />
            ))}
          </div>
          <Panel accent="gold" className="mt-4 max-w-3xl p-4">
            <Eyebrow tone="gold">Why</Eyebrow>
            <p className="mt-1 text-hud-base">{group.why}</p>
          </Panel>
        </div>
      ))}

      <SectionTitle id={slug(PAGES_NAV[1])}>
        Pages: before and after, in the real app
      </SectionTitle>
      <p className="mb-4 max-w-3xl text-hud-base text-hud-dim">
        Captured by <code>scripts/page-shots</code> from the running app at 1280
        by 720, offline with seeded demo teams. Left is before this work, right
        is after. Where a page is taller than the screen, the whole page link
        shows all of it.
      </p>
      {!manifest && (
        <p className="text-hud-base text-hud-warn">
          No captures found. Run scripts/page-shots to make them.
        </p>
      )}
      <div className="flex flex-col gap-8">
        {PAGE_SHOTS.filter(
          ([name]) => has("before", name) || has("after", name)
        ).map(([name, title]) => (
          <figure key={name}>
            <figcaption className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-hud-label text-hud-lg font-bold uppercase tracking-[0.04em]">
                {title}
              </span>
              {(["before", "after"] as const).map(
                (side) =>
                  has(side, `${name}-full`) && (
                    <Link
                      key={side}
                      href={`./shots/pages/${side}/${name}-full.jpg`}
                      className="hud-label hover:text-hud-gold"
                    >
                      Whole page, {side}
                    </Link>
                  )
              )}
              {has("after-1920", name) && (
                <Link
                  href={`./shots/pages/after-1920/${name}.jpg`}
                  className="hud-label hover:text-hud-gold"
                >
                  After at 1920 by 1080
                </Link>
              )}
            </figcaption>
            <div className="grid gap-3 lg:grid-cols-2">
              {(["before", "after"] as const).map((side) =>
                has(side, name) ? (
                  <ShotLink
                    key={side}
                    src={`./shots/pages/${side}/${name}.jpg`}
                    alt={`${title}, ${side}`}
                    side={side}
                  />
                ) : (
                  <div
                    key={side}
                    className="flex aspect-video items-center justify-center rounded-hud border border-dashed border-white/15 text-hud-sm text-hud-mute"
                  >
                    No {side} capture of this state
                  </div>
                )
              )}
            </div>
          </figure>
        ))}
      </div>
    </>
  );
}

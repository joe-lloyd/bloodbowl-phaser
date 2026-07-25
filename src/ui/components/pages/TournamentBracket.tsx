import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  layoutBracket,
  eliminatedEntrantIds,
} from "../../../competition/bracketLayout";
import {
  CompetitionEntrant,
  CompetitionFixture,
} from "../../../competition/types";

/** Minimum width of a round column; the bracket scrolls past this. */
const COLUMN_MIN_WIDTH = 210;
/** Vertical breathing room per leaf slot — what stops the tree feeling cramped. */
const HEIGHT_PER_LEAF = 190;

export interface BracketFixtureContext {
  fixture: CompetitionFixture;
  home?: CompetitionEntrant;
  away?: CompetitionEntrant;
  ready: boolean;
}

interface TournamentBracketProps {
  fixtures: CompetitionFixture[];
  entrants: CompetitionEntrant[];
  championEntrantId?: string;
  /** Controls for a fixture — omitted entirely when it is not ready to play. */
  renderActions: (context: BracketFixtureContext) => React.ReactNode;
  /** Shown instead of the bracket when the viewport is too narrow to read it. */
  fallback: React.ReactNode;
}

interface CardBox {
  left: number;
  right: number;
  centreY: number;
}

/**
 * True while the viewport is below `minWidth`. A seven-column bracket is
 * unreadable on a phone even with horizontal scrolling, so below this we hand
 * over to the round-by-round list rather than shipping a squeezed bracket.
 */
function useBelowWidth(minWidth: number): boolean {
  const [below, setBelow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(`(max-width: ${minWidth - 1}px)`);
    const sync = () => setBelow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [minWidth]);

  return below;
}

function sameBoxes(a: Map<string, CardBox>, b: Map<string, CardBox>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, box] of b) {
    const previous = a.get(id);
    if (
      !previous ||
      previous.left !== box.left ||
      previous.right !== box.right ||
      previous.centreY !== box.centreY
    ) {
      return false;
    }
  }
  return true;
}

export function TournamentBracket({
  fixtures,
  entrants,
  championEntrantId,
  renderActions,
  fallback,
}: TournamentBracketProps) {
  const layout = useMemo(() => layoutBracket(fixtures), [fixtures]);
  const eliminated = useMemo(() => eliminatedEntrantIds(fixtures), [fixtures]);
  const narrow = useBelowWidth(640);

  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const [boxes, setBoxes] = useState<Map<string, CardBox>>(new Map());

  const registerCard = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element) cardRefs.current.set(id, element);
      else cardRefs.current.delete(id);
    },
    []
  );

  /**
   * Cards live in document flow — their height varies with the controls they
   * show — so their positions are only known once rendered. Measure them and
   * draw connectors to the measured card edges. The SVG is absolutely
   * positioned and cannot affect card layout, so this settles in one pass.
   */
  useLayoutEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      if (!container) return;
      const base = container.getBoundingClientRect();
      const next = new Map<string, CardBox>();
      cardRefs.current.forEach((element, id) => {
        const rect = element.getBoundingClientRect();
        next.set(id, {
          left: rect.left - base.left,
          right: rect.right - base.left,
          centreY: rect.top - base.top + rect.height / 2,
        });
      });
      setBoxes((previous) => (sameBoxes(previous, next) ? previous : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    cardRefs.current.forEach((element) => observer.observe(element));
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [fixtures, layout]);

  const entrantOf = (id: string | null | undefined) =>
    entrants.find((candidate) => candidate.id === id);

  // Below four entrants there is no tree to draw — show the tie directly.
  if (narrow || layout.nodes.length === 0 || entrants.length < 4) {
    return <>{fallback}</>;
  }

  // One flex column per bracket column, cards ordered top to bottom by the
  // layout's row. `justify-around` is what centres each round between the ties
  // feeding it — no absolute positioning, so cards can never overlap however
  // tall their controls make them.
  const columns = Array.from({ length: layout.columns }, (_, column) =>
    layout.nodes
      .filter((node) => node.column === column)
      .sort((a, b) => a.row - b.row)
  );
  const sideOf = new Map(
    layout.nodes.map((node) => [node.fixture.id, node.side])
  );
  const champion = entrantOf(championEntrantId);

  return (
    // The bracket scrolls inside its own box; the page never scrolls sideways.
    <div className="overflow-x-auto pb-4">
      <div
        ref={containerRef}
        className="relative flex gap-x-10 items-stretch"
        style={{
          minWidth: layout.columns * COLUMN_MIN_WIDTH,
          minHeight: layout.rows * HEIGHT_PER_LEAF,
        }}
      >
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          aria-hidden="true"
        >
          {layout.connectors.map((connector) => {
            const from = boxes.get(connector.fromFixtureId);
            const to = boxes.get(connector.toFixtureId);
            if (!from || !to) return null;
            // Left half runs rightward into the centre, right half leftward.
            const rightward = sideOf.get(connector.fromFixtureId) !== "right";
            const startX = rightward ? from.right : from.left;
            const endX = rightward ? to.left : to.right;
            const midX = (startX + endX) / 2;
            return (
              <polyline
                key={`${connector.fromFixtureId}->${connector.toFixtureId}`}
                points={[
                  `${startX},${from.centreY}`,
                  `${midX},${from.centreY}`,
                  `${midX},${to.centreY}`,
                  `${endX},${to.centreY}`,
                ].join(" ")}
                fill="none"
                stroke="currentColor"
                className="text-bb-dark-gold"
                strokeWidth={2}
              />
            );
          })}
        </svg>

        {columns.map((nodes, column) => (
          <div
            key={column}
            className="relative z-10 flex flex-col justify-around gap-y-8 flex-1"
            style={{ minWidth: COLUMN_MIN_WIDTH }}
          >
            {nodes.map((node) => {
              const { fixture } = node;
              const home = entrantOf(fixture.homeEntrantId);
              const away = entrantOf(fixture.awayEntrantId);
              const ready = fixture.status === "ready" && Boolean(home && away);
              const winnerId = fixture.result?.winnerEntrantId;
              const isFinal = node.side === "final";

              const card = (
                <article
                  ref={registerCard(fixture.id)}
                  className={`bg-bb-warm-paper border-2 rounded-lg p-3 shadow-md ${
                    isFinal ? "border-bb-gold" : "border-bb-dark-gold"
                  }`}
                >
                  <BracketSlot
                    entrant={home}
                    score={fixture.result?.homeScore}
                    isWinner={!!winnerId && winnerId === fixture.homeEntrantId}
                    isEliminated={
                      !!fixture.homeEntrantId &&
                      eliminated.has(fixture.homeEntrantId)
                    }
                    bye={false}
                  />
                  <BracketSlot
                    entrant={away}
                    score={fixture.result?.awayScore}
                    isWinner={!!winnerId && winnerId === fixture.awayEntrantId}
                    isEliminated={
                      !!fixture.awayEntrantId &&
                      eliminated.has(fixture.awayEntrantId)
                    }
                    bye={!!fixture.result?.bye}
                  />
                  {ready && (
                    <div className="mt-2 border-t border-bb-divider pt-2">
                      {renderActions({ fixture, home, away, ready })}
                    </div>
                  )}
                </article>
              );

              // The trophy rides with the final as ONE flex item, so it cannot
              // skew where `justify-around` places the final card.
              if (isFinal && champion) {
                return (
                  <div key={fixture.id} className="flex flex-col gap-2">
                    <div className="text-center">
                      <div className="text-4xl leading-none" aria-hidden="true">
                        🏆
                      </div>
                      <div className="font-heading uppercase text-bb-gold text-lg leading-tight">
                        {champion.name}
                      </div>
                    </div>
                    {card}
                  </div>
                );
              }
              return (
                <React.Fragment key={fixture.id}>{card}</React.Fragment>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketSlot({
  entrant,
  score,
  isWinner,
  isEliminated,
  bye,
}: {
  entrant?: CompetitionEntrant;
  score?: number;
  isWinner: boolean;
  isEliminated: boolean;
  bye: boolean;
}) {
  const label = entrant?.name ?? (bye ? "BYE" : "TBD");
  return (
    <div
      className={`font-body text-sm flex justify-between gap-2 py-0.5 ${
        isWinner ? "font-bold text-bb-ink-blue" : ""
      } ${isEliminated ? "opacity-50 line-through" : ""} ${
        !entrant ? "italic text-bb-muted-text" : ""
      }`}
    >
      <span className="truncate" title={entrant?.name}>
        {label}
      </span>
      <strong className="tabular-nums">{score ?? "—"}</strong>
    </div>
  );
}

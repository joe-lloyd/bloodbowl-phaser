import { type RefObject, useEffect, useRef, useState } from "react";
import { Chip, Panel } from "../ui/components/componentWarehouse/HudKit";
import type { DriftSpec, Fact, Specimen } from "./driftSpec";
import { FRAME_SIZES, type FrameSize, frameUrl } from "./frames";
import { bringIntoView, findSpecimen, readFact } from "./measure";
import { useNearScreen } from "./useNearScreen";

const MARGIN = 10;
const REMEASURE_MS = 600;
const WIDEST = 560;

interface Cut {
  left: number;
  top: number;
  width: number;
  height: number;
  values: string[];
}

function cutOut(
  frame: HTMLIFrameElement | null,
  specimen: Specimen,
  facts: readonly Fact[]
): Cut | null {
  const element = findSpecimen(frame?.contentDocument, specimen);
  if (!element) return null;
  bringIntoView(element);
  const box = element.getBoundingClientRect();
  return {
    left: box.left - MARGIN,
    top: box.top - MARGIN,
    width: box.width + MARGIN * 2,
    height: box.height + MARGIN * 2,
    values: facts.map((fact) => readFact(element, fact)),
  };
}

function useCut(
  frame: RefObject<HTMLIFrameElement | null>,
  specimen: Specimen,
  facts: readonly Fact[]
): Cut | null {
  const [cut, setCut] = useState<Cut | null>(null);
  useEffect(() => {
    const timer = setInterval(() => {
      setCut((held) => cutOut(frame.current, specimen, facts) ?? held);
    }, REMEASURE_MS);
    return () => {
      clearInterval(timer);
    };
  }, [frame, specimen, facts]);
  return cut;
}

function Numbers({ cut, facts }: { cut: Cut | null; facts: readonly Fact[] }) {
  if (!cut)
    return (
      <p className="mt-2 text-hud-sm text-hud-mute">
        Not shown at this screen size.
      </p>
    );
  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-hud-sm">
      {facts.map((fact, index) => (
        <div key={fact.label} className="contents">
          <dt className="text-hud-dim">{fact.label}</dt>
          <dd>{cut.values[index]}</dd>
        </div>
      ))}
    </dl>
  );
}

const NOT_FOUND: Cut = { left: 0, top: 0, width: 280, height: 120, values: [] };

function LiveCut({
  specimen,
  facts,
  size,
}: {
  specimen: Specimen;
  facts: readonly Fact[];
  size: FrameSize;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const cut = useCut(frame, specimen, facts);
  const { left, top, ...box } = cut ?? NOT_FOUND;
  const scale = Math.min(1, WIDEST / box.width);
  const { width, height } = FRAME_SIZES[size];
  return (
    <>
      <div
        data-cut={cut ? "yes" : "no"}
        className="relative overflow-hidden rounded-hud border border-white/10 bg-black"
        style={{
          width: box.width * scale,
          height: box.height * scale,
        }}
      >
        <iframe
          ref={frame}
          title={specimen.label}
          src={frameUrl(specimen.variant, size)}
          width={width}
          height={height}
          className="absolute left-0 top-0 max-w-none origin-top-left border-0"
          style={{
            transform: `scale(${String(scale)}) translate(${String(-left)}px, ${String(-top)}px)`,
          }}
        />
      </div>
      <Numbers cut={cut} facts={facts} />
    </>
  );
}

export function DriftFinding({
  finding,
  size,
}: {
  finding: DriftSpec;
  size: FrameSize;
}) {
  const box = useRef<HTMLDivElement>(null);
  const near = useNearScreen(box);
  return (
    <div ref={box} data-drift={finding.id} id={`drift-${finding.id}`}>
      <Panel accent="warn" className="min-h-[220px] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-hud-label text-hud-xl font-bold uppercase tracking-[0.04em]">
            {finding.title}
          </h3>
          <Chip tone="warn">{finding.specimens.length} shapes</Chip>
        </div>
        <p className="mt-1 max-w-3xl text-hud-base">{finding.sentence}</p>
        <div className="mt-4 flex flex-wrap items-start gap-6">
          {finding.specimens.map((specimen) => (
            <figure
              key={`${specimen.label} ${specimen.variant} ${specimen.selector}`}
              className="max-w-full overflow-x-auto"
            >
              <figcaption className="hud-label mb-1">
                {specimen.label}
              </figcaption>
              {near && (
                <LiveCut
                  key={size}
                  specimen={specimen}
                  facts={finding.facts}
                  size={size}
                />
              )}
            </figure>
          ))}
        </div>
      </Panel>
    </div>
  );
}

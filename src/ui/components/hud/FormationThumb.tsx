import { activeLayout, pairFrame } from "../../../game/variants/activeMatch";
import { isPlayableSquare } from "../../../game/variants/pitchLayouts";
import { blockOf } from "../../../game/rules/frames";
import type { FormationPosition } from "../../../types/SetupTypes";

function setupHalf(isTeam1: boolean) {
  const layout = activeLayout();
  const frame = pairFrame(isTeam1);
  const setupAlong = { min: 0, max: frame.arm.scrimmage };
  const [lower, upper] = frame.arm.wide;
  const { min, max } = blockOf(frame, setupAlong, frame.arm.setupAcross);
  const minX = min.x;
  const maxX = max.x;
  const inHalf = ({ x }: { x: number }) => x >= minX && x <= maxX;
  return {
    layout,
    minX,
    maxX,
    inHalf,
    cols: maxX - minX + 1,
    rows: layout.rows,
    lineX: isTeam1 ? maxX + 1 : minX,
    wideEdges: {
      top: blockOf(frame, setupAlong, lower).max.y + 1,
      bottom: blockOf(frame, setupAlong, upper).min.y,
    },
    obstacles: layout.obstacles.filter((element) => inHalf(element)),
  };
}

function HalfPitch({ half }: { half: ReturnType<typeof setupHalf> }) {
  const { minX, maxX, cols, rows, lineX, wideEdges } = half;
  return (
    <>
      <rect x={minX} y={0} width={cols} height={rows} className="fill-hud-good/35" />
      <path
        d={[
          `M${String(minX)} ${String(wideEdges.top)}H${String(maxX + 1)}`,
          `M${String(minX)} ${String(wideEdges.bottom)}H${String(maxX + 1)}`,
        ].join("")}
        className="fill-none stroke-hud-bone"
        strokeOpacity={0.35}
        strokeWidth={0.1}
        strokeDasharray="0.4 0.3"
      />
      {half.obstacles.map(({ x, y }) => (
        <rect
          key={`${String(x)},${String(y)}`}
          x={x}
          y={y}
          width={1}
          height={1}
          className="fill-hud-ink"
        />
      ))}
      <path
        d={`M${String(lineX)} 0V${String(rows)}`}
        className="stroke-hud-gold"
        strokeWidth={0.45}
      />
    </>
  );
}

export function FormationThumb({
  positions,
  isTeam1,
  className,
}: {
  positions: readonly FormationPosition[];
  isTeam1: boolean;
  className?: string;
}) {
  const half = setupHalf(isTeam1);
  const { minX, cols, rows, layout } = half;
  const dots = positions.filter(
    (at) => half.inHalf(at) && isPlayableSquare(layout, at)
  );
  return (
    <svg
      aria-hidden="true"
      viewBox={`${String(minX - 0.4)} -0.4 ${String(cols + 0.8)} ${String(rows + 0.8)}`}
      className={className}
      data-testid="formation-thumb"
    >
      <HalfPitch half={half} />
      {dots.map(({ x, y, playerId }) => (
        <circle
          key={playerId}
          cx={x + 0.5}
          cy={y + 0.5}
          r={0.44}
          className="fill-hud-bone stroke-hud-ink"
          strokeWidth={0.12}
        />
      ))}
    </svg>
  );
}

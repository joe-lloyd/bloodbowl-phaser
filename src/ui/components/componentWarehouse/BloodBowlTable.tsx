import { ReactNode } from "react";
import { cx, HudTone, Panel, PanelHeader } from "./HudKit";

interface BloodBowlTableProps {
  title?: string;
  /** Small label on the right of the title bar. */
  aside?: ReactNode;
  accent?: HudTone | { color: string };
  headers: (string | { label: string; width?: string; className?: string })[];
  children: ReactNode;
  className?: string;
}

/**
 * A data table on a HUD slab: a title bar, then `.hud-table`. Column widths
 * are declared once on the `<colgroup>` so headers and values line up, and
 * the table scrolls sideways inside its slab on narrow screens.
 */
export const BloodBowlTable = ({
  title,
  aside,
  accent,
  headers,
  children,
  className,
}: BloodBowlTableProps) => (
  <Panel accent={accent} className={cx("w-full", className)}>
    {title && <PanelHeader as="h2" title={title} aside={aside} className="px-4" />}
    <div className="hud-scroll overflow-x-auto">
      <table className="hud-table">
        <colgroup>
          {headers.map((header, index) => {
            const width = typeof header === "object" ? header.width : undefined;
            return <col key={index} style={width ? { width } : undefined} />;
          })}
        </colgroup>
        <thead>
          <tr>
            {headers.map((header, index) =>
              typeof header === "string" ? (
                <th key={index}>{header}</th>
              ) : (
                <th key={index} className={header.className}>
                  {header.label}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  </Panel>
);

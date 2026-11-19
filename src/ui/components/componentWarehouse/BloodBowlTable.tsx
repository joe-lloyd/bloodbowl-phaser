import { type ReactNode } from "react";
import { cx, type HudTone, Panel, PanelHeader } from "./HudKit";

interface BloodBowlTableProps {
  title?: string;

  aside?: ReactNode;
  accent?: HudTone | { color: string };
  headers: (string | { label: string; width?: string; className?: string })[];
  children: ReactNode;
  className?: string;
}

export const BloodBowlTable = ({
  title,
  aside,
  accent,
  headers,
  children,
  className,
}: BloodBowlTableProps) => (
  <Panel accent={accent} className={cx("w-full", className)}>
    {title && (
      <PanelHeader as="h2" title={title} aside={aside} className="px-4" />
    )}
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

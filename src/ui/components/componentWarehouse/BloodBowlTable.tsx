import React, { ReactNode } from "react";
import StarDecoration from "./StarDecoration";
import triangleIcon from "../../assets/triangle.svg";

interface TableTitleProps {
  children: ReactNode;
  variant: "red" | "blue";
}

export const TableTitle = ({ children, variant }: TableTitleProps) => {
  const borderColor =
    variant === "red" ? "border-bb-ink-blue" : "border-bb-gold"; // Blue table contrast
  const textColor =
    variant === "red" ? "text-bb-blood-red" : "text-bb-ink-blue";
  const triangleFilter =
    variant === "blue" ? "hue-rotate(200deg) brightness(0.5)" : ""; // Shift red to blue-ish

  return (
    <div
      className={`flex items-center justify-center text-center border-b-[5px] ${borderColor} pt-2`}
    >
      {/* Left Triangle */}
      <div className="mr-5 h-8 flex items-center">
        <img
          src={triangleIcon}
          alt=""
          className="h-full w-auto"
          style={{ filter: triangleFilter }}
        />
      </div>

      <h2
        className={`${textColor} font-heading font-bold text-2xl uppercase tracking-widest px-4`}
      >
        {children}
      </h2>

      {/* Right Triangle (flipped) */}
      <div className="ml-5 h-8 flex items-center transform scale-x-[-1]">
        <img
          src={triangleIcon}
          alt=""
          className="h-full w-auto"
          style={{ filter: triangleFilter }}
        />
      </div>
    </div>
  );
};

export const TableFooter = ({ variant }: { variant: "red" | "blue" }) => {
  const borderColor =
    variant === "red" ? "border-bb-ink-blue" : "border-bb-gold";

  return (
    <div className="relative mb-5">
      <div
        className={`flex items-center justify-center border-t-[5px] ${borderColor} pt-4`}
      >
        {/* Decorative Separator matching style */}
        <div className="absolute top-[-5px] left-0 w-full flex justify-between px-12 pointer-events-none opacity-0">
          {/* Placeholder for complex border if needed */}
        </div>
      </div>
      <StarDecoration />
    </div>
  );
};

interface BloodBowlTableProps {
  title?: string;
  headers: (string | { label: string; width?: string; className?: string })[];
  children: ReactNode;
  className?: string;
  variant?: "red" | "blue";
}

export const BloodBowlTable = ({
  title,
  headers,
  children,
  className = "",
  variant = "red",
}: BloodBowlTableProps) => {
  const headerBg = variant === "red" ? "bg-bb-blood-red" : "bg-[#1d3860]"; // User requested dark blue header
  const headerText = "text-bb-parchment";

  return (
    <div className={`w-full ${className}`}>
      {title && <TableTitle variant={variant}>{title}</TableTitle>}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <colgroup>
            {headers.map((header, index) => {
              const width =
                typeof header === "object" ? header.width : undefined;
              return <col key={index} style={width ? { width } : undefined} />;
            })}
          </colgroup>
          <thead>
            <tr>
              {headers.map((header, index) => {
                const label =
                  typeof header === "string" ? header : header.label;
                const customClass =
                  typeof header === "object" ? header.className : "";

                return (
                  <th
                    key={index}
                    className={`${headerBg} ${headerText} p-3 font-bold uppercase tracking-wider text-sm border-0 ${customClass}`}
                  >
                    {label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="font-body text-bb-text-dark">{children}</tbody>
        </table>
      </div>

      <TableFooter variant={variant} />
    </div>
  );
};

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode;
  className?: string;
}

export const TableRow = ({
  children,
  className = "",
  ...props
}: TableRowProps) => (
  <tr
    className={`even:bg-black/5 hover:bg-black/10 transition-colors ${className}`}
    {...props}
  >
    {children}
  </tr>
);

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  children: ReactNode;
}

export const TableCell = ({
  children,
  className = "",
  ...props
}: TableCellProps) => (
  <td className={`p-3 border-0 ${className}`} {...props}>
    {children}
  </td>
);

export const CustomTableCell = ({
  children,
  className = "",
  ...props
}: TableCellProps) => (
  <td className={`p-3 border-0 font-bold ${className}`} {...props}>
    {children}
  </td>
);

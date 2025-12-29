import { ReactNode } from "react";

interface TableWrapperProps {
  children: ReactNode;
  className?: string;
}

export const TableWrapper = ({
  children,
  className = "",
}: TableWrapperProps) => {
  return (
    <div
      className={`w-full overflow-x-auto border-l-4 border-r-4 border-bb-ink-blue ${className}`}
    >
      {children}
    </div>
  );
};

export const MainTable = ({ children, className = "" }: TableWrapperProps) => {
  return (
    <table
      className={`w-full border-collapse bg-bb-warm-paper border border-bb-divider ${className}`}
    >
      {children}
    </table>
  );
};

export const TableHeader = ({
  children,
  className = "",
}: TableWrapperProps) => {
  return (
    <th
      className={`
      bg-bb-ink-blue text-bb-parchment
      p-2.5
      font-heading font-semibold text-sm uppercase
      border border-bb-divider
      ${className}
    `}
    >
      {children}
    </th>
  );
};

interface TableRowProps {
  children: ReactNode;
  className?: string;
}

export const TableRow = ({ children, className = "" }: TableRowProps) => {
  return (
    <tr
      className={`
      even:bg-bb-parchment
      hover:bg-bb-warm-paper hover:bg-opacity-70
      transition-bb
      ${className}
    `}
    >
      {children}
    </tr>
  );
};

export const TableCell = ({ children, className = "" }: TableWrapperProps) => {
  return (
    <td
      className={`
      border border-bb-divider
      text-center p-2.5
      font-body text-sm
      text-bb-text-dark
      ${className}
    `}
    >
      {children}
    </td>
  );
};

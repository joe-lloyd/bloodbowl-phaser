import { ReactNode } from 'react';

interface TableWrapperProps {
  children: ReactNode;
  className?: string;
}

export const TableWrapper = ({ children, className = '' }: TableWrapperProps) => {
  return (
    <div className={`w-full overflow-x-auto border-l-4 border-r-4 border-blood-bowl-primary ${className}`}>
      {children}
    </div>
  );
};

export const MainTable = ({ children, className = '' }: TableWrapperProps) => {
  return (
    <table className={`w-full border-collapse bg-blood-bowl-light-blue border-none ${className}`}>
      {children}
    </table>
  );
};

export const TableHeader = ({ children, className = '' }: TableWrapperProps) => {
  return (
    <th className={`bg-blood-bowl-primary text-white p-2.5 font-bold border border-blood-bowl-primary ${className}`}>
      {children}
    </th>
  );
};

interface TableRowProps {
  children: ReactNode;
  className?: string;
}

export const TableRow = ({ children, className = '' }: TableRowProps) => {
  return (
    <tr className={`even:bg-gray-50 hover:bg-blood-bowl-light-blue ${className}`}>
      {children}
    </tr>
  );
};

export const TableCell = ({ children, className = '' }: TableWrapperProps) => {
  return (
    <td className={`border border-blood-bowl-primary text-center p-2.5 ${className}`}>
      {children}
    </td>
  );
};

import React, { ReactNode } from 'react';
import StarDecoration from './StarDecoration';
import triangleIcon from '../../assets/triangle.svg';

export const TableTitle = ({ children }: { children: ReactNode }) => {
    return (
        <div className="flex items-center justify-center mb-1 text-center border-b-[5px] border-bb-ink-blue pb-2 pt-2">
            {/* Left Triangle */}
            <div className="mr-5 h-8 flex items-center">
                <img src={triangleIcon} alt="" className="h-full w-auto" />
            </div>

            <h2 className="text-bb-blood-red font-heading font-bold text-2xl uppercase tracking-widest px-4">
                {children}
            </h2>

            {/* Right Triangle (flipped) */}
            <div className="ml-5 h-8 flex items-center transform scale-x-[-1]">
                <img src={triangleIcon} alt="" className="h-full w-auto" />
            </div>
        </div>
    );
};

export const TableFooter = () => {
    return (
        <div className="relative mb-5 mt-4">
            <div className="flex items-center justify-center border-t-[5px] border-bb-ink-blue pt-4">
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
    headers: string[];
    children: ReactNode;
    className?: string;
}

export const BloodBowlTable = ({ title, headers, children, className = '' }: BloodBowlTableProps) => {
    return (
        <div className={`w-full ${className}`}>
            {title && <TableTitle>{title}</TableTitle>}

            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                    <thead>
                        <tr>
                            {headers.map((header, index) => (
                                <th
                                    key={index}
                                    className="bg-bb-blood-red text-bb-parchment p-3 font-bold uppercase tracking-wider text-sm border-0"
                                >
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="font-body text-bb-text-dark">
                        {children}
                    </tbody>
                </table>
            </div>

            <TableFooter />
        </div>
    );
};

export const TableRow = ({ children, className = '' }: { children: ReactNode, className?: string }) => (
    <tr className={`even:bg-black/10 hover:bg-black/5 ${className}`}>
        {children}
    </tr>
);

export const TableCell = ({ children, className = '', colSpan }: { children: ReactNode, className?: string, colSpan?: number }) => (
    <td className={`p-3 border-0 ${className}`} colSpan={colSpan}>
        {children}
    </td>
);

export const CustomTableCell = ({ children, className = '', colSpan }: { children: ReactNode, className?: string, colSpan?: number }) => (
    <td className={`p-3 border-0 font-bold ${className}`} colSpan={colSpan}>
        {children}
    </td>
);

import { ReactNode } from "react";

interface TitleProps {
  children: ReactNode;
  className?: string;
}

export const Title = ({ children, className = "" }: TitleProps) => {
  return (
    <h1
      className={`
      text-5xl md:text-6xl
      font-heading font-bold uppercase
      text-bb-blood-red
      tracking-tight
      mb-4
      ${className}
    `}
    >
      {children}
    </h1>
  );
};

export const SeasonTitle = ({ children, className = "" }: TitleProps) => {
  return (
    <h2
      className={`
      bg-bb-ink-blue
      text-bb-gold
      px-6 py-4 mb-8
      text-3xl md:text-4xl
      font-heading font-bold uppercase
      tracking-tight
      ${className}
    `}
    >
      {children}
    </h2>
  );
};

export const Subtitle = ({ children, className = "" }: TitleProps) => {
  return (
    <h2
      className={`
      text-2xl md:text-3xl
      font-heading font-semibold uppercase
      text-bb-ink-blue
      tracking-tight
      my-6
      ${className}
    `}
    >
      {children}
    </h2>
  );
};

export const SectionTitle = ({ children, className = "" }: TitleProps) => {
  return (
    <h3
      className={`
      text-xl md:text-2xl
      font-heading font-bold uppercase
      text-bb-blood-red
      tracking-tight
      border-b-2 border-bb-divider
      pb-2 mb-4
      ${className}
    `}
    >
      {children}
    </h3>
  );
};

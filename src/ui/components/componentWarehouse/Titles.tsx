import { ReactNode } from 'react';

interface TitleProps {
  children: ReactNode;
  className?: string;
}

export const Title = ({ children, className = '' }: TitleProps) => {
  return <h1 className={`text-4xl font-bold text-blood-bowl-primary ${className}`}>{children}</h1>;
};

export const SeasonTitle = ({ children, className = '' }: TitleProps) => {
  return (
    <h2 className={`bg-blood-bowl-danger text-blood-bowl-gold p-4 mb-8 ${className}`}>
      {children}
    </h2>
  );
};

export const Subtitle = ({ children, className = '' }: TitleProps) => {
  return <h2 className={`text-2xl text-blood-bowl-primary my-4 ${className}`}>{children}</h2>;
};

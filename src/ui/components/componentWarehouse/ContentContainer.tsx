import { ReactNode } from 'react';

interface ContentContainerProps {
  children: ReactNode;
  className?: string;
}

const ContentContainer = ({ children, className = '' }: ContentContainerProps) => {
  return (
    <div className={`w-full max-w-[90vw] 2xl:max-w-[1800px] mx-auto p-10 xl:p-8 lg:p-6 ${className}`}>
      {children}
    </div>
  );
};

export default ContentContainer;

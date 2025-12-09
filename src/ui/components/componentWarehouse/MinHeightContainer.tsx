import { ReactNode } from 'react';

interface MinHeightContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * 47.5px is the height of the app bar
 */
const MinHeightContainer = ({ children, className = '' }: MinHeightContainerProps) => {
  return (
    <div className={`flex flex-col min-h-screen justify-center ${className}`}>
      {children}
    </div>
  );
};

export default MinHeightContainer;

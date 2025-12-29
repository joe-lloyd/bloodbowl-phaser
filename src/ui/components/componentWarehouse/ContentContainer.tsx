import { ReactNode } from "react";

interface ContentContainerProps {
  children: ReactNode;
  className?: string;
}

const ContentContainer = ({
  children,
  className = "",
}: ContentContainerProps) => {
  return (
    <div className={`w-full h-full p-12 xl:p-10 lg:p-8 md:p-6 ${className}`}>
      {children}
    </div>
  );
};

export default ContentContainer;

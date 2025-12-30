import React from "react";
import starIcon from "../../assets/star.svg";

interface StarIconProps {
  className?: string;
}

const StarIcon: React.FC<StarIconProps> = ({ className = "w-5 h-5" }) => (
  <img src={starIcon} alt="Star" className={className} />
);

const StarDecoration = () => {
  return (
    <div className="flex justify-center items-center w-full my-2">
      <div className="transform scale-75 opacity-80">
        <StarIcon className="w-5 h-5" />
      </div>
      <div className="mx-1 transform scale-110">
        <StarIcon className="w-5 h-5" />
      </div>
      <div className="transform scale-75 opacity-80">
        <StarIcon className="w-5 h-5" />
      </div>
    </div>
  );
};

export default StarDecoration;

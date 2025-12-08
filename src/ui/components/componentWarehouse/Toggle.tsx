import React from 'react';

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

const Toggle: React.FC<ToggleProps> = ({ label, checked, onChange }) => {
  const [isChecked, setIsChecked] = React.useState(checked);

  return (
    <div className="flex items-center my-1.5">
      <label
        htmlFor={`${label}-toggle`}
        className="mr-2.5 font-bold text-blood-bowl-primary flex items-center cursor-pointer"
      >
        <span>{label}</span>
        <div className="ml-2">
          <input
            id={`${label}-toggle`}
            type="checkbox"
            className="absolute opacity-0 w-0 h-0 peer"
            checked={isChecked}
            onChange={() => {
              setIsChecked(!isChecked);
              onChange(!isChecked);
            }}
          />
          <span className="relative inline-block w-15 h-8.5 bg-blood-bowl-primary rounded-full cursor-pointer transition-colors peer-checked:bg-blood-bowl-danger before:content-[''] before:absolute before:w-6.5 before:h-6.5 before:left-1 before:bottom-1 before:bg-white before:rounded-full before:transition-transform peer-checked:before:translate-x-6.5"></span>
        </div>
      </label>
    </div>
  );
};

export default Toggle;

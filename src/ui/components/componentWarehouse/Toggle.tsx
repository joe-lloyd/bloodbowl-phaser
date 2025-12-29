import React from "react";

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
        className="mr-2.5 font-heading font-semibold text-bb-ink-blue flex items-center cursor-pointer"
      >
        <span>{label}</span>
        <div className="ml-2">
          <input
            id={`${label}-toggle`}
            type="checkbox"
            className="sr-only peer"
            checked={isChecked}
            onChange={() => {
              setIsChecked(!isChecked);
              onChange(!isChecked);
            }}
          />
          {/* Square/shield-shaped toggle */}
          <div
            className="
            relative inline-flex items-center justify-center
            w-12 h-12
            bg-bb-warm-paper
            border-2 border-bb-divider
            cursor-pointer
            transition-bb
            peer-checked:bg-bb-gold peer-checked:border-bb-dark-gold
            hover:shadow-md
          "
          >
            {/* Checkmark when checked */}
            {isChecked && (
              <svg
                className="w-8 h-8 text-bb-text-dark"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </div>
        </div>
      </label>
    </div>
  );
};

export default Toggle;

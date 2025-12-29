import { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export const Button = ({
  children,
  onClick,
  disabled,
  className = "",
}: ButtonProps) => {
  return (
    <button
      className={`
        px-8 py-4 my-3
        text-xl font-heading font-semibold uppercase
        bg-bb-blood-red text-bb-parchment
        border-2 border-bb-dark-gold
        rounded-lg
        cursor-pointer
        transition-bb
        hover:bg-bb-deep-crimson
        active:shadow-chunky
        disabled:bg-bb-muted-text disabled:text-bb-divider disabled:cursor-not-allowed disabled:transform-none disabled:border-bb-divider
        shadow-md
        ${className}
      `}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export const DangerButton = ({
  children,
  onClick,
  disabled,
  className = "",
}: ButtonProps) => {
  return (
    <button
      className={`
        px-8 py-4 my-3
        text-xl font-heading font-semibold uppercase
        bg-bb-error text-bb-parchment
        border-2 border-bb-dark-gold
        rounded-lg
        cursor-pointer
        transition-bb
        hover:bg-bb-blood-red
        active:shadow-chunky
        disabled:bg-bb-muted-text disabled:text-bb-divider disabled:cursor-not-allowed disabled:transform-none disabled:border-bb-divider
        shadow-md
        ${className}
      `}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export const SecondaryButton = ({
  children,
  onClick,
  disabled,
  className = "",
}: ButtonProps) => {
  return (
    <button
      className={`
        px-8 py-4 my-3
        text-xl font-heading font-semibold uppercase
        bg-bb-ink-blue text-bb-parchment
        border-2 border-bb-dark-gold
        rounded-lg
        cursor-pointer
        transition-bb
        hover:bg-opacity-80
        active:shadow-chunky
        disabled:bg-bb-muted-text disabled:text-bb-divider disabled:cursor-not-allowed disabled:transform-none disabled:border-bb-divider
        shadow-md
        ${className}
      `}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export const RemoveButton = ({
  children,
  onClick,
  className = "",
}: ButtonProps) => {
  return (
    <button
      className={`
        px-4 py-2
        text-base font-heading font-semibold
        bg-bb-error text-bb-parchment
        border border-bb-dark-gold
        rounded
        cursor-pointer
        transition-bb
        hover:bg-bb-blood-red hover:shadow-md
        ${className}
      `}
      onClick={onClick}
    >
      {children}
    </button>
  );
};

export const InlineLink = ({
  children,
  onClick,
  className = "",
}: ButtonProps) => {
  return (
    <span
      className={`
        px-6 py-3 my-3
        inline-block
        font-body font-semibold
        bg-bb-blood-red text-bb-parchment
        border border-bb-dark-gold
        rounded
        cursor-pointer
        transition-bb
        hover:bg-bb-deep-crimson hover:shadow-md
        ${className}
      `}
      onClick={onClick}
    >
      {children}
    </span>
  );
};

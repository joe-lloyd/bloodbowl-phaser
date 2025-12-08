import { ReactNode } from 'react';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export const Button = ({ children, onClick, disabled, className = '' }: ButtonProps) => {
  return (
    <button
      className={`my-2.5 px-4 py-2.5 bg-blood-bowl-primary text-white border-none cursor-pointer rounded hover:bg-blood-bowl-primary-dark active:bg-blood-bowl-primary transition-colors disabled:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export const DangerButton = ({ children, onClick, disabled, className = '' }: ButtonProps) => {
  return (
    <button
      className={`my-2.5 px-4 py-2.5 bg-blood-bowl-danger text-white border-none cursor-pointer rounded hover:bg-blood-bowl-danger-dark active:bg-blood-bowl-danger transition-colors disabled:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export const RemoveButton = ({ children, onClick, className = '' }: ButtonProps) => {
  return (
    <button
      className={`bg-blood-bowl-danger text-white border-none cursor-pointer px-2.5 py-1.5 rounded hover:bg-blood-bowl-danger-dark transition-colors ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
};

export const InlineLink = ({ children, onClick, className = '' }: ButtonProps) => {
  return (
    <span
      className={`px-5 py-2.5 inline-block my-2.5 bg-blood-bowl-danger text-white border-none cursor-pointer hover:bg-blood-bowl-danger-dark transition-colors ${className}`}
      onClick={onClick}
    >
      {children}
    </span>
  );
};

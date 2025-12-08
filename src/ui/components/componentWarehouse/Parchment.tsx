import { ReactNode } from 'react';

interface ParchmentProps {
  $intensity?: 'low' | 'high';
  children?: ReactNode;
}

const Parchment = ({ $intensity = 'high' }: ParchmentProps) => {
  const shadowClass = $intensity === 'low' ? 'shadow-parchment-light' : 'shadow-parchment';
  const positionClass = $intensity === 'low' ? 'absolute' : 'fixed';

  return (
    <div className={`${positionClass} inset-0 w-full h-full top-0 left-0 ${shadowClass} bg-blood-bowl-parchment -z-10`}></div>
  );
};

export default Parchment;

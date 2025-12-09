import { ReactNode } from 'react';

interface ParchmentProps {
  $intensity?: 'low' | 'high';
  children?: ReactNode;
}

const Parchment = ({ $intensity = 'high' }: ParchmentProps) => {
  const shadowClass = $intensity === 'low' ? 'shadow-parchment-light' : 'shadow-parchment';
  const positionClass = $intensity === 'low' ? 'absolute' : 'fixed';

  return (
    <div
      className={`
        ${positionClass} inset-0 w-full h-full top-0 left-0 -z-10
        bg-bb-parchment ${shadowClass}
      `}
      style={{
        backgroundImage: `
          repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(214, 178, 94, 0.03) 2px,
            rgba(214, 178, 94, 0.03) 4px
          ),
          repeating-linear-gradient(
            90deg,
            transparent,
            transparent 2px,
            rgba(214, 178, 94, 0.03) 2px,
            rgba(214, 178, 94, 0.03) 4px
          ),
          radial-gradient(
            ellipse at 20% 30%,
            rgba(232, 221, 196, 0.4) 0%,
            transparent 50%
          ),
          radial-gradient(
            ellipse at 80% 70%,
            rgba(232, 221, 196, 0.3) 0%,
            transparent 50%
          )
        `,
        backgroundBlendMode: 'multiply'
      }}
    >
    </div>
  );
};

export default Parchment;

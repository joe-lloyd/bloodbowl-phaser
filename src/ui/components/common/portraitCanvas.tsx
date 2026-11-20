import { forwardRef } from "react";

interface PortraitCanvasProps {
  readonly label: string;
  readonly model: string;
  readonly shown: number;
  readonly onHover: (hover: boolean) => void;
}

export const PortraitCanvas = forwardRef<HTMLCanvasElement, PortraitCanvasProps>(function PortraitCanvas(props, ref) {
  return (
    <canvas
      ref={ref}
      aria-label={props.label}
      role="img"
      data-model={props.model}
      onMouseEnter={() => {
        props.onHover(true);
      }}
      onMouseLeave={() => {
        props.onHover(false);
      }}
      style={{ width: props.shown, height: props.shown, imageRendering: "pixelated" }}
      className="shrink-0"
    />
  );
});

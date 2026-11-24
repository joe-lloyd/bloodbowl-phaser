import { useEffect, useRef, useState } from "react";
import { FRAME_SIZES, type FrameSize, frameUrl } from "./frames";
import { useNearScreen } from "./useNearScreen";
import type { Variant } from "./variant";

const SHEET_WIDTH = { desktop: 1120, phone: 844 } as const;

function useWidth(element: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!element.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element.current);
    return () => {
      observer.disconnect();
    };
  }, [element]);
  return width;
}

function useSheetHeight(
  iframe: React.RefObject<HTMLIFrameElement | null>,
  active: boolean
): number {
  const [height, setHeight] = useState(520);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      const sheet =
        iframe.current?.contentDocument?.querySelector("[data-sheet]");
      if (sheet)
        setHeight(
          Math.max(520, Math.ceil(sheet.getBoundingClientRect().height))
        );
    }, 400);
    return () => {
      clearInterval(timer);
    };
  }, [iframe, active]);
  return height;
}

export function Frame({
  variant,
  size,
}: {
  variant: Variant;
  size: FrameSize;
}) {
  const box = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const near = useNearScreen(box);
  const room = useWidth(box);
  const sheet = variant.stage === "sheet";
  const sheetHeight = useSheetHeight(iframe, sheet && near);
  const width = sheet ? SHEET_WIDTH[size] : FRAME_SIZES[size].width;
  const height = sheet ? sheetHeight : FRAME_SIZES[size].height;
  const scale = Math.min(1, room / width);
  return (
    <div ref={box} className="w-full">
      <div
        className="overflow-hidden rounded-hud border border-white/10 bg-black"
        style={{ width: width * scale, height: height * scale }}
      >
        {near && room > 0 && (
          <iframe
            ref={iframe}
            title={variant.title}
            src={frameUrl(variant.id, size)}
            width={width}
            height={height}
            className="origin-top-left border-0"
            style={{ transform: `scale(${String(scale)})` }}
          />
        )}
      </div>
    </div>
  );
}

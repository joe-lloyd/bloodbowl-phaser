import { HudButton } from "../ui/components/componentWarehouse/HudKit";
import { FRAME_SIZES, type FrameSize } from "./frames";

const SIZES = ["desktop", "phone"] as const;

export function SizeSwitch({
  size,
  onChange,
}: {
  size: FrameSize;
  onChange: (size: FrameSize) => void;
}) {
  return (
    <div role="group" aria-label="Screen size" className="flex gap-2">
      {SIZES.map((id) => (
        <HudButton
          key={id}
          size="sm"
          variant={id === size ? "selected" : "ghost"}
          aria-pressed={id === size}
          onClick={() => {
            onChange(id);
          }}
        >
          {FRAME_SIZES[id].label}
        </HudButton>
      ))}
    </div>
  );
}

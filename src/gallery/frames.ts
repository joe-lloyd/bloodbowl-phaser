export const FRAME_SIZES = {
  desktop: { label: "Desktop 1280 x 720", width: 1280, height: 720 },
  phone: { label: "Phone 844 x 390", width: 844, height: 390 },
} as const;

export type FrameSize = keyof typeof FRAME_SIZES;

export const isFrameSize = (value: string | null): value is FrameSize =>
  value === "desktop" || value === "phone";

export const frameUrl = (id: string, size: FrameSize) =>
  `?v=${id}&size=${size}`;

export const slug = (text: string) =>
  text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");

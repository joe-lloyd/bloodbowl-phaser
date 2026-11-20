export function wholePixelSize(side: number, size: number): number {
  if (side <= 0 || size < side) return size;
  return side * Math.floor(size / side);
}

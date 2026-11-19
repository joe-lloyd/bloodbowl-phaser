export interface PhaseHandler {
  enter(): void;

  exit(): void;
}

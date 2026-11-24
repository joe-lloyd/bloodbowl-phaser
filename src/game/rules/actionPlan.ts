import type { RouteRoll } from "./rollPreview";

export type PlanRollKind =
  | RouteRoll["type"]
  | "gate"
  | "standUp"
  | "pass"
  | "catch"
  | "armour";

interface PlanRoll {
  kind: PlanRollKind;
  name: string;
  target: number;
}

export interface PlanStage {
  label: string;
  rolls: PlanRoll[];
  notes: string[];
}

export interface ActionPlanSummary {
  title: string;
  squares: number;
  stages: PlanStage[];
  rerolls: string[];
  blocked: string | null;
}

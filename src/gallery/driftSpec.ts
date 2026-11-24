type Measure =
  | "width"
  | "height"
  | "fontSize"
  | "fontFamily"
  | "padding"
  | "letterSpacing"
  | "color"
  | "backgroundColor";

export interface Fact {
  label: string;
  measure: Measure;
  selector?: string;
}

export interface Specimen {
  variant: string;
  label: string;
  selector: string;
  contains?: string;
}

export interface DriftSpec {
  id: string;
  title: string;
  sentence: string;
  specimens: readonly Specimen[];
  facts: readonly Fact[];
}

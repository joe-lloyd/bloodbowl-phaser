import { GAME_TYPES } from "../../src/game/variants/gameTypes";
import {
  GAME_TYPE_WEIGHTS,
  ROSTER_WEIGHTS,
  type Weights,
} from "../../src/simulation/ai/weights";
import {
  type Change,
  type Layer,
  type Layers,
  TUNABLE_ROSTERS,
  WEIGHT_NAMES,
  type WeightName,
} from "../boundary/schemas";

type Values = Partial<Weights>;

export function currentLayers(): Layers {
  const gameTypes: Layers["gameTypes"] = {};
  for (const type of GAME_TYPES) {
    const values = GAME_TYPE_WEIGHTS[type];
    if (values) gameTypes[type] = { ...values };
  }
  const rosters: Layers["rosters"] = {};
  for (const roster of TUNABLE_ROSTERS) {
    const values = ROSTER_WEIGHTS[roster];
    if (values) rosters[roster] = { ...values };
  }
  return { weights: {}, rosters, gameTypes };
}

export function layerValues(layers: Layers, layer: Layer): Values {
  switch (layer.kind) {
    case "all":
      return layers.weights;
    case "gameType":
      return layers.gameTypes[layer.gameType] ?? {};
    case "roster":
      return layers.rosters[layer.roster] ?? {};
  }
}

function without(values: Values, name: WeightName): Values {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => key !== name)
  );
}

export interface LayerEdit {
  layer: Layer;
  name: WeightName;
  value: number | null;
}

export function withValue(layers: Layers, edit: LayerEdit): Layers {
  const { layer, name, value } = edit;
  const rest = without(layerValues(layers, layer), name);
  const values = value === null ? rest : { ...rest, [name]: value };
  switch (layer.kind) {
    case "all":
      return { ...layers, weights: values };
    case "gameType":
      return {
        ...layers,
        gameTypes: { ...layers.gameTypes, [layer.gameType]: values },
      };
    case "roster":
      return {
        ...layers,
        rosters: { ...layers.rosters, [layer.roster]: values },
      };
  }
}

export const LAYERS: readonly Layer[] = [
  { kind: "all" },
  ...GAME_TYPES.map((gameType): Layer => ({ kind: "gameType", gameType })),
  ...TUNABLE_ROSTERS.map((roster): Layer => ({ kind: "roster", roster })),
];

export function diffLayers(current: Layers, next: Layers): Change[] {
  return LAYERS.flatMap((layer) => {
    const before = layerValues(current, layer);
    const after = layerValues(next, layer);
    return WEIGHT_NAMES.flatMap((weight): Change[] => {
      const was = before[weight] ?? null;
      const now = after[weight] ?? null;
      return was === now
        ? []
        : [{ layer, weight, current: was, candidate: now }];
    });
  });
}

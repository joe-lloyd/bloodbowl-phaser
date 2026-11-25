import { z } from "zod";
import { parseJson } from "../../src/boundary/json";

export const CHARACTER_KEY = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const key = z.string().max(40).regex(CHARACTER_KEY, "Use lower-case letters, digits and single underscores, starting with a letter");
const label = z.string().trim().min(1).max(60);
const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const layout = z.record(z.string(), scalar);
const knobValue = z.union([z.number(), z.boolean()]);
const body = z.enum(["m", "f", "x"]);
const stance = z.record(z.string(), z.union([z.number(), z.string()]));
const MOTION: readonly string[] = ["stride", "arm_swing", "run_lean", "jump"];
const motion = z.record(z.string(), z.number()).refine((record) => Object.keys(record).every((name) => MOTION.includes(name)), `Motion only has ${MOTION.join(", ")}`);

const optionValue = z.object({ value: key, label, layout: layout.nullable() });
const ownOption = z.object({
  name: key.refine((name) => name !== "body", "body is already an option"),
  label,
  values: z.array(optionValue).min(1),
});

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function sharedKeys(options: readonly z.infer<typeof ownOption>[]): string[] {
  const keys = options.flatMap((option) => [...new Set(option.values.flatMap((value) => Object.keys(value.layout ?? {})))]);
  return [...new Set(keys.filter((name, index) => keys.indexOf(name) !== index))];
}

const ownLooks = z
  .object({ kind: z.literal("own"), bodies: z.array(body).min(1), options: z.array(ownOption) })
  .refine((looks) => unique(looks.options.map((option) => option.name)), "Two look options share a name")
  .refine((looks) => looks.options.every((option) => unique(option.values.map((v) => v.value))), "Two values of one look option share a name")
  .superRefine((looks, context) => {
    for (const name of sharedKeys(looks.options)) {
      context.addIssue({ code: "custom", message: `Two look options both set ${name}. Set it in one of them.` });
    }
  });

const characterSchema = z.object({
  key,
  label,
  base: key,
  race: z.string(),
  sex: body,
  height: z.number().min(0.5).max(1.6),
  parts: z.enum(["keep", "drop"]),
  knobs: z.record(z.string(), knobValue),
  layout,
  stance,
  motion,
  looks: z.discriminatedUnion("kind", [z.object({ kind: z.literal("base") }), ownLooks]),
  usedBy: z.array(z.object({ roster: z.string(), position: z.string() })),
});

export type Character = z.infer<typeof characterSchema>;
export type OwnOption = z.infer<typeof ownOption>;
export type LayoutValues = z.infer<typeof layout>;
export type LayoutValue = z.infer<typeof scalar>;

const fieldBase = { key: z.string(), generic: z.boolean(), optional: z.boolean(), layered: z.boolean() };
const field = z.discriminatedUnion("kind", [
  z.object({ ...fieldBase, kind: z.literal("toggle") }),
  z.object({ ...fieldBase, kind: z.literal("number"), whole: z.boolean() }),
  z.object({ ...fieldBase, kind: z.literal("material") }),
  z.object({ ...fieldBase, kind: z.literal("choice"), values: z.array(z.string()) }),
]);

const baseModel = z.object({
  key: z.string(),
  character: z.boolean(),
  doc: z.string(),
  race: z.string(),
  sex: body,
  height: z.number(),
  knobs: z.record(z.string(), knobValue),
  layout,
  stance,
  motion,
  ownKeys: z.array(z.string()),
  lookKeys: z.array(z.string()),
  bodies: z.array(z.tuple([z.string(), z.string()])),
  options: z.array(z.object({ name: z.string(), label: z.string(), values: z.array(z.object({ value: z.string(), label: z.string() })) })),
});

const catalogSchema = z.object({
  races: z.array(z.object({ key: z.string(), knobs: z.record(z.string(), knobValue), layout })),
  knobs: z.array(z.string()),
  materials: z.array(z.object({ key: z.string(), colors: z.array(z.string()) })),
  fields: z.array(field),
  models: z.array(baseModel),
  errors: z.record(z.string(), z.string()),
});

export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogField = z.infer<typeof field>;
export type BaseModel = z.infer<typeof baseModel>;

const jobSchema = z.object({
  id: z.string(),
  kind: z.enum(["preview", "export"]),
  key: z.string(),
  status: z.enum(["queued", "running", "done", "failed"]),
  log: z.array(z.string()),
});

export type StudioJob = z.infer<typeof jobSchema>;

const studioStateSchema = z.object({
  catalog: catalogSchema,
  characters: z.array(characterSchema),
  positions: z.record(z.string(), z.array(z.string())),
  models: z.array(z.string()),
  renderer: z.string(),
  job: jobSchema.nullable(),
});

export type StudioState = z.infer<typeof studioStateSchema>;

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const previewRequest = z.object({ character: characterSchema, primary: hex, secondary: hex });
const environment = z.object({ STUDIO_BLENDER_HOST: z.string().default("jellybingus"), BLENDER: z.string().optional(), STUDIO_HOME: z.string().optional() });
const manifestSchema = z.object({
  models: z.record(z.string(), z.unknown()),
  positions: z.record(z.string(), z.record(z.string(), z.string())),
});

export type PreviewRequest = z.infer<typeof previewRequest>;

export const parseCharacter = (text: string): Character => parseJson(text, characterSchema);
export const parseCatalog = (text: string): Catalog => parseJson(text, catalogSchema);
export const parsePreview = (text: string): PreviewRequest => parseJson(text, previewRequest);
export const parseSpriteManifest = (text: string): z.infer<typeof manifestSchema> => parseJson(text, manifestSchema);
export const studioEnvironment = (): z.infer<typeof environment> => environment.parse(process.env);

export function characterProblem(character: Character): string | null {
  const parsed = characterSchema.safeParse(character);
  return parsed.success ? null : z.prettifyError(parsed.error);
}

async function call<Value>(url: string, schema: z.ZodType<Value>, init?: RequestInit): Promise<Value> {
  const response = await fetch(`/studio-api/${url}`, { ...init, headers: { "content-type": "application/json" } });
  if (!response.ok) throw new Error(await response.text());
  const value: unknown = await response.json();
  return schema.parse(value);
}

export const fetchStudio = (): Promise<StudioState> => call("state", studioStateSchema);
export const fetchJob = (id: string): Promise<StudioJob> => call(`jobs/${id}`, jobSchema);
export const startExport = (characterKey: string): Promise<StudioJob> => call(`export/${characterKey}`, jobSchema, { method: "POST" });
export const startPreview = (request: PreviewRequest): Promise<StudioJob> =>
  call("preview", jobSchema, { method: "POST", body: JSON.stringify(request) });
export const saveCharacter = (character: Character): Promise<Character> =>
  call("characters", characterSchema, { method: "PUT", body: JSON.stringify(character) });

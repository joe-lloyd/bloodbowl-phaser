import { z } from "zod";

const labJobSchema = z.looseObject({
  id: z.string(),
  candidateSide: z.union([z.literal(0), z.literal(1)]),
});

const labManifestSchema = z.looseObject({
  jobs: labJobSchema.array(),
  revision: z.string(),
});

export type LabJob = z.infer<typeof labJobSchema>;

type LabManifest = z.infer<typeof labManifestSchema>;

function assertLabManifest(value: unknown): asserts value is LabManifest {
  labManifestSchema.parse(value);
}

export function parseLabManifest(text: string): LabManifest {
  const value: unknown = JSON.parse(text);
  assertLabManifest(value);
  return value;
}

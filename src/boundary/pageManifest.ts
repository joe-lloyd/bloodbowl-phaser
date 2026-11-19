import { z } from "zod";
import { fetchJson } from "./json";

const pageManifestSchema = z.object({
  before: z.string().array(),
  after: z.string().array(),
  "after-1920": z.string().array(),
});

export type PageManifest = z.infer<typeof pageManifestSchema>;

export function loadPageManifest(): Promise<PageManifest> {
  return fetchJson("./shots/pages/manifest.json", pageManifestSchema);
}

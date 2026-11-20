import { z } from "zod";

const environmentSchema = z.object({
  UPDATE_VISUAL_BASELINES: z.string().optional(),
  FIRESTORE_EMULATOR_HOST: z.string().optional(),
});

export function shouldUpdateVisualBaselines(): boolean {
  return environmentSchema.parse(process.env).UPDATE_VISUAL_BASELINES === "1";
}

export function firestoreEmulatorHost(): string | undefined {
  return environmentSchema.parse(process.env).FIRESTORE_EMULATOR_HOST;
}

export async function uploadFirestoreRules({
  host,
  project,
  rules,
}: {
  host: string;
  project: string;
  rules: string;
}): Promise<{ ok: boolean; text: string }> {
  const response = await fetch(
    `http://${host}/emulator/v1/projects/${project}:securityRules`,
    {
      method: "PUT",
      body: JSON.stringify({ rules: { files: [{ content: rules }] } }),
    }
  );
  return { ok: response.ok, text: await response.text() };
}

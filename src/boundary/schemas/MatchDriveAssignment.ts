import { z } from "zod";
import type { MatchDriveAssignment } from "../../headless/serialization";

export const matchDriveAssignmentSchema: z.ZodType<MatchDriveAssignment> =
  z.looseObject({
    kickingTeamId: z.string(),
    receivingTeamId: z.string(),
    half: z.union([z.literal(1), z.literal(2)]),
  });

import { z } from "zod";
import { lobbyStatusSchema } from "./LobbyStatus";
import { matchResumeSchema } from "./MatchResume";
import { lobbySettingsSchema } from "./LobbySettings";
import { lobbyPlayerSchema } from "./LobbyPlayer";
import { gameSnapshotSchema } from "./GameSnapshot";
import { timerStateSchema } from "./TimerState";
import { competitionContextSchema } from "./CompetitionContext";
import { teamSchema } from "./Team";
import type { LobbyDoc } from "../../firebase/lobby";

export const lobbyDocSchema: z.ZodType<LobbyDoc> = z.looseObject({
  code: z.string(),
  hostUid: z.string(),
  guestUid: z.union([z.null(), z.string()]),
  status: lobbyStatusSchema,
  seedCommits: z.record(z.string(), z.string()).exactOptional(),
  seedReveals: z.record(z.string(), z.string()).exactOptional(),
  resume: z.union([z.null(), matchResumeSchema]).exactOptional(),
  settings: lobbySettingsSchema,
  players: z.record(z.string(), lobbyPlayerSchema),
  createdAt: z.unknown(),
  snapshot: z.union([z.null(), gameSnapshotSchema]).exactOptional(),
  endRequestBy: z.union([z.null(), z.string()]).exactOptional(),
  coinFlip: z
    .union([
      z.null(),
      z.looseObject({
        hostReady: z.union([z.literal(false), z.literal(true)]).exactOptional(),
        guestReady: z
          .union([z.literal(false), z.literal(true)])
          .exactOptional(),
        winnerTeamId: z.union([z.null(), z.string()]).exactOptional(),
        kickingTeamId: z.union([z.null(), z.string()]).exactOptional(),
      }),
    ])
    .exactOptional(),
  timer: z.union([z.null(), timerStateSchema]).exactOptional(),
  competitionContext: competitionContextSchema.exactOptional(),
  fixtureTeams: z
    .looseObject({
      home: teamSchema,
      away: teamSchema,
    })
    .exactOptional(),
  listed: z.boolean().exactOptional(),
  reservedFor: z.string().exactOptional(),
});

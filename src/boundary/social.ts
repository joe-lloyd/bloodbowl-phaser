import { z } from "zod";

export const FRIEND_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const FRIEND_CODE_LENGTH = 8;

const friendCodeSchema = z
  .string()
  .regex(/^[A-HJ-NP-Z2-9]{8}$/)
  .brand<"FriendCode">();
export type FriendCode = z.infer<typeof friendCodeSchema>;

const coachProfileSchema = z.object({
  uid: z.string(),
  coachName: z.string().exactOptional(),
  friendCode: friendCodeSchema,
  lastSeen: z.number(),
});
export type CoachProfile = z.infer<typeof coachProfileSchema>;

const friendshipSchema = z.object({
  uids: z.tuple([z.string(), z.string()]),
  requesterUid: z.string(),
  status: z.enum(["pending", "accepted"]),
  createdAt: z.number(),
});
export type Friendship = z.infer<typeof friendshipSchema>;

const matchInviteSchema = z.object({
  kind: z.literal("match"),
  fromUid: z.string(),
  toUid: z.string(),
  code: z.string(),
  createdAt: z.number(),
});
const competitionTypeSchema = z.enum(["league", "tournament"]);

const fixtureInviteSchema = z.object({
  kind: z.literal("fixture"),
  fromUid: z.string(),
  toUid: z.string(),
  code: z.string(),
  competitionType: competitionTypeSchema,
  competitionId: z.string(),
  competitionName: z.string(),
  fixtureId: z.string(),
  createdAt: z.number(),
});

const competitionInviteSchema = z.object({
  kind: z.literal("competition"),
  fromUid: z.string(),
  toUid: z.string(),
  competitionType: competitionTypeSchema,
  competitionId: z.string(),
  competitionName: z.string(),
  createdAt: z.number(),
});

const inviteSchema = z.discriminatedUnion("kind", [
  matchInviteSchema,
  fixtureInviteSchema,
  competitionInviteSchema,
]);
export type Invite = z.infer<typeof inviteSchema>;
export type LobbyInvite = Extract<Invite, { kind: "match" | "fixture" }>;

const friendCodeOwnerSchema = z.object({ uid: z.string() });

export function readCoachProfile(value: unknown): CoachProfile {
  return coachProfileSchema.parse(value);
}

export function readFriendship(value: unknown): Friendship {
  return friendshipSchema.parse(value);
}

export function readInvite(value: unknown): Invite {
  return inviteSchema.parse(value);
}

export function readFriendCodeOwner(value: unknown): string {
  return friendCodeOwnerSchema.parse(value).uid;
}

export function parseFriendCode(input: string): FriendCode | null {
  const parsed = friendCodeSchema.safeParse(
    input.toUpperCase().replace(/[^A-Z0-9]/g, "")
  );
  return parsed.success ? parsed.data : null;
}

import { z } from "zod";
import { accountIdSchema, setRoleRequestSchema } from "./roles.ts";

/** A Support grant needs a reason (`billing.manual_grants.reason`). */
export const GRANT_REASON_MAX = 1000;

/** A future ISO timestamp, or no end date (null, empty or left out). */
const grantEndsAt = z
  .union([z.iso.datetime({ offset: true, error: "endsAt must be an ISO timestamp" }), z.literal("")])
  .nullish()
  .transform((value) => value || null);

/** Body of `POST /api/support/actions`; each action carries only what its Function needs. */
export const adminActionSchema = z.discriminatedUnion(
  "action",
  [
    z.object({ action: z.literal("verify-email"), userId: accountIdSchema }),
    z.object({
      action: z.literal("grant-premium"),
      userId: accountIdSchema,
      reason: z
        .string({ error: "reason is required" })
        .trim()
        .min(1, "reason is required")
        .max(GRANT_REASON_MAX, `reason must be at most ${GRANT_REASON_MAX} characters`),
      endsAt: grantEndsAt,
    }),
    z.object({ action: z.literal("revoke-premium"), userId: accountIdSchema }),
    z.object({
      action: z.literal("set-disabled"),
      userId: accountIdSchema,
      disabled: z.boolean({ error: "disabled must be true or false" }),
    }),
    setRoleRequestSchema.extend({ action: z.literal("set-role") }),
  ],
  { error: "Unknown action" },
);

export type AdminAction = z.infer<typeof adminActionSchema>;

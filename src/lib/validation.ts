import { z } from "zod";

/** Zod schemas for API input validation (multi-user; user comes from session). */

export const attributeTypeEnum = z.enum([
  "name",
  "alias",
  "email",
  "phone",
  "address_current",
  "address_prior",
  "dob",
  "relative",
]);

export const identityAttributeInput = z
  .object({
    type: attributeTypeEnum,
    value: z.string().trim().min(1, "Value is required").max(500),
    isPrimary: z.boolean().optional().default(false),
    verified: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.type === "email") {
      if (!z.string().email().safeParse(data.value).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid email address",
          path: ["value"],
        });
      }
    }
    if (data.type === "phone") {
      const digits = data.value.replace(/\D+/g, "");
      if (digits.length < 10 || digits.length > 15) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Phone must have 10–15 digits",
          path: ["value"],
        });
      }
    }
    if (data.type === "dob") {
      if (!/^\d{4}(-\d{2}-\d{2})?$/.test(data.value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "DOB must be YYYY or YYYY-MM-DD",
          path: ["value"],
        });
      }
    }
  });

export const addAttributesInput = z.object({
  attributes: z.array(identityAttributeInput).min(1).max(100),
});

// Signup electronic authorization capture (§2.2).
export const signAuthorizationInput = z.object({
  agree: z.literal(true, {
    errorMap: () => ({ message: "You must authorize the platform to act for you." }),
  }),
  consentVersion: z.string().min(1),
  residencyState: z.string().trim().max(2).optional(),
});

export const updateAccountInput = z.object({
  residencyState: z.string().trim().max(2).optional(),
  confirmationSource: z.enum(["gmail", "forwarding", "none"]).optional(),
});

export const createRemovalRequestInput = z.object({
  brokerId: z.string().min(1),
  listingId: z.string().optional(),
});

export const sendEmailOptOutInput = z.object({
  approved: z.literal(true),
});

export const recordDropSubmissionInput = z.object({
  requestReference: z.string().trim().max(200).optional(),
});

// --- Admin: broker registry + discovery -----------------------------------

export const removalMethodEnum = z.enum([
  "drop",
  "email",
  "web_form",
  "postal",
  "manual_only",
]);

export const brokerStatusEnum = z.enum([
  "proposed",
  "approved",
  "live",
  "retired",
  "rejected",
]);

export const upsertBrokerInput = z.object({
  name: z.string().trim().min(1).max(200),
  domain: z.string().trim().min(1).max(200),
  optOutUrl: z.string().trim().url().optional().or(z.literal("")),
  removalMethod: removalMethodEnum,
  optOutEmail: z.string().trim().email().optional().or(z.literal("")),
  requiresCaptcha: z.boolean().optional().default(false),
  requiresId: z.boolean().optional().default(false),
  confirmationEmailFrom: z.string().trim().max(200).optional(),
  recheckDays: z.number().int().min(1).max(365).optional().default(30),
  caRegistered: z.boolean().optional().default(false),
  status: brokerStatusEnum.optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const reviewProposalInput = z.object({
  brokerId: z.string().min(1),
  action: z.enum(["approve", "reject"]),
  // Optional edits applied before approval.
  edits: upsertBrokerInput.partial().optional(),
});

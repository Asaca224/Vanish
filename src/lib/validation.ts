import { z } from "zod";

/** Zod schemas for API input validation. */

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

// Per-type value validation. Runs after a non-empty check.
export const identityAttributeInput = z
  .object({
    type: attributeTypeEnum,
    value: z.string().trim().min(1, "Value is required").max(500),
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
      // Accept a full date or a year-only value (approximate DOB per §1).
      if (!/^\d{4}(-\d{2}-\d{2})?$/.test(data.value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "DOB must be YYYY or YYYY-MM-DD",
          path: ["value"],
        });
      }
    }
  });

export const createSubjectInput = z.object({
  label: z.string().trim().min(1).max(100).default("self"),
  isOperator: z.boolean().default(true),
  // Required for non-operator subjects before any request is submitted (§9).
  authorizedAgentDocRef: z.string().trim().max(500).optional(),
});

export const addAttributesInput = z.object({
  subjectId: z.string().min(1),
  attributes: z.array(identityAttributeInput).min(1).max(100),
});

export const createRemovalRequestInput = z.object({
  subjectId: z.string().min(1),
  brokerId: z.string().min(1),
  listingId: z.string().optional(),
});

export const sendEmailOptOutInput = z.object({
  removalRequestId: z.string().min(1),
  // Operator must approve the drafted email before it sends (§2.2).
  approved: z.literal(true),
});

export const recordDropSubmissionInput = z.object({
  subjectId: z.string().min(1),
  requestReference: z.string().trim().max(200).optional(),
});

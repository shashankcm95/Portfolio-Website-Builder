import { z } from "zod";

export const verificationStatusEnum = z.enum([
  "verified",
  "unverified",
  "flagged",
]);

export const claimVerificationSchema = z.object({
  sentenceIndex: z.number(),
  sentenceText: z.string(),
  factIds: z.array(z.string()),
  verification: verificationStatusEnum,
  confidence: z.number().min(0).max(1),
});

export const verificationResultSchema = z.object({
  claims: z.array(claimVerificationSchema),
});

export type VerificationStatus = z.infer<typeof verificationStatusEnum>;
export type ClaimVerification = z.infer<typeof claimVerificationSchema>;
export type VerificationResult = z.infer<typeof verificationResultSchema>;

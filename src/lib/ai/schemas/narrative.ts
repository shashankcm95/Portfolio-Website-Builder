import { z } from "zod";

export const sectionTypeEnum = z.enum([
  "summary",
  "architecture",
  "tech_narrative",
  "recruiter_pitch",
  "engineer_deep_dive",
]);

export const variantEnum = z.enum(["recruiter", "engineer"]);

export const narrativeSectionSchema = z.object({
  sectionType: sectionTypeEnum,
  variant: variantEnum,
  content: z.string(),
});

export const narrativeResultSchema = z.object({
  sections: z.array(narrativeSectionSchema),
});

export type SectionType = z.infer<typeof sectionTypeEnum>;
export type Variant = z.infer<typeof variantEnum>;
export type NarrativeSection = z.infer<typeof narrativeSectionSchema>;
export type NarrativeResult = z.infer<typeof narrativeResultSchema>;

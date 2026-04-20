import { z } from "zod";

/**
 * The LLM frequently emits `null` for missing string fields instead of
 * omitting them. Preprocess null → undefined so `.optional()` accepts both.
 */
const optionalString = z.preprocess(
  (v) => (v === null ? undefined : v),
  z.string().optional()
);

const optionalStringArray = z.preprocess(
  (v) => (v === null ? undefined : v),
  z.array(z.string()).optional()
);

export const locationSchema = z.object({
  city: optionalString,
  region: optionalString,
  country: optionalString,
});

export const profileSchema = z.object({
  network: z.string(),
  username: z.string(),
  url: optionalString,
});

export const basicsSchema = z.object({
  name: z.string(),
  label: optionalString,
  email: optionalString,
  phone: optionalString,
  url: optionalString,
  summary: optionalString,
  location: z.preprocess(
    (v) => (v === null ? undefined : v),
    locationSchema.optional()
  ),
  profiles: z.preprocess(
    (v) => (v === null ? undefined : v),
    z.array(profileSchema).optional()
  ),
});

export const workSchema = z.object({
  company: z.string(),
  position: z.string(),
  startDate: z.string(),
  endDate: optionalString,
  summary: optionalString,
  highlights: optionalStringArray,
});

export const educationSchema = z.object({
  institution: z.string(),
  area: optionalString,
  studyType: optionalString,
  startDate: optionalString,
  endDate: optionalString,
});

export const skillSchema = z.object({
  name: z.string(),
  level: optionalString,
  keywords: optionalStringArray,
});

export const projectSchema = z.object({
  name: z.string(),
  description: optionalString,
  url: optionalString,
  highlights: optionalStringArray,
  keywords: optionalStringArray,
});

export const certificationSchema = z.object({
  name: z.string(),
  issuer: optionalString,
  date: optionalString,
});

export const structuredResumeSchema = z.object({
  basics: basicsSchema,
  work: z.array(workSchema).optional(),
  education: z.array(educationSchema).optional(),
  skills: z.array(skillSchema).optional(),
  projects: z.array(projectSchema).optional(),
  certifications: z.array(certificationSchema).optional(),
});

export type StructuredResume = z.infer<typeof structuredResumeSchema>;
export type WorkEntry = z.infer<typeof workSchema>;
export type EducationEntry = z.infer<typeof educationSchema>;
export type SkillEntry = z.infer<typeof skillSchema>;
export type ProjectEntry = z.infer<typeof projectSchema>;
export type CertificationEntry = z.infer<typeof certificationSchema>;

import { z } from "zod";

export const locationSchema = z.object({
  city: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
});

export const profileSchema = z.object({
  network: z.string(),
  username: z.string(),
  url: z.string().optional(),
});

export const basicsSchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  url: z.string().optional(),
  summary: z.string().optional(),
  location: locationSchema.optional(),
  profiles: z.array(profileSchema).optional(),
});

export const workSchema = z.object({
  company: z.string(),
  position: z.string(),
  startDate: z.string(),
  endDate: z.string().optional(),
  summary: z.string().optional(),
  highlights: z.array(z.string()).optional(),
});

export const educationSchema = z.object({
  institution: z.string(),
  area: z.string().optional(),
  studyType: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const skillSchema = z.object({
  name: z.string(),
  level: z.string().optional(),
  keywords: z.array(z.string()).optional(),
});

export const projectSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  url: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
});

export const certificationSchema = z.object({
  name: z.string(),
  issuer: z.string().optional(),
  date: z.string().optional(),
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

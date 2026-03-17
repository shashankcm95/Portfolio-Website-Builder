import { z } from "zod";

export const techStackSchema = z.object({
  languages: z.array(z.string()),
  frameworks: z.array(z.string()),
  libraries: z.array(z.string()),
  tools: z.array(z.string()),
});

export const architectureSchema = z.object({
  type: z.string(),
  pattern: z.string(),
  signals: z.array(z.string()),
});

export const complexitySchema = z.object({
  fileCount: z.number(),
  languages: z.record(z.string(), z.number()),
});

export const contextPackSchema = z.object({
  techStack: techStackSchema,
  architecture: architectureSchema,
  complexity: complexitySchema,
  keyFeatures: z.array(z.string()),
});

export type TechStack = z.infer<typeof techStackSchema>;
export type Architecture = z.infer<typeof architectureSchema>;
export type Complexity = z.infer<typeof complexitySchema>;
export type ContextPack = z.infer<typeof contextPackSchema>;

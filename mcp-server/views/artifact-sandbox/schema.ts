import { z } from "zod";

const exerciseSchema = z.object({
  id: z.number(),
  title: z.string(),
  instructions: z.string(),
  difficulty: z.string(),
});

const artifactSchema = z.object({
  type: z.string(),
  html: z.string(),
  evaluation_criteria: z.string(),
  system_prompt: z.string().nullable(),
  passing_score: z.number(),
});

export const propsSchema = z.object({
  exercise: exerciseSchema,
  artifact: artifactSchema,
});

export type Props = z.infer<typeof propsSchema>;

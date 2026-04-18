import { z } from "zod";

export const KnowledgeEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  tags: z.array(z.string()).default([]),
  content: z.string(),
  metadata: z.record(z.any()).default({}),
});

export type KnowledgeEntity = z.infer<typeof KnowledgeEntitySchema>;

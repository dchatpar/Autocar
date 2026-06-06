/**
 * AI Agent schemas — Zod validation for /ai-agents/*
 */

import { z } from "zod";

export const AgentNameSchema = z.enum(["NOVA", "ARIO", "SAGE", "LUCAS"]);

export const AgentRunBodySchema = z.object({
  entityType: z.enum(["LEAD", "CUSTOMER", "DEAL", "VEHICLE"]).optional(),
  entityId: z.string().cuid().optional(),
  /** Action hint — agent decides internally how to respond. */
  action: z.string().max(100).optional(),
  /** Dry-run skips outbound calls; useful for UI previews. */
  dryRun: z.boolean().default(false),
});

export const ListAgentRunsQuerySchema = z.object({
  entityType: z.enum(["LEAD", "CUSTOMER", "DEAL", "VEHICLE"]).optional(),
  entityId: z.string().cuid().optional(),
  status: z.string().optional(),
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const ToggleAgentBodySchema = z.object({
  isEnabled: z.boolean(),
});

export const AgentIdParamsSchema = z.object({
  id: AgentNameSchema,
});

export type AgentRunBody = z.infer<typeof AgentRunBodySchema>;
export type ListAgentRunsQuery = z.infer<typeof ListAgentRunsQuerySchema>;
export type ToggleAgentBody = z.infer<typeof ToggleAgentBodySchema>;
export type AgentIdParams = z.infer<typeof AgentIdParamsSchema>;

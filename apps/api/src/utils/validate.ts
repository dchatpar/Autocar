/**
 * Zod validation helpers for Fastify.
 *
 * `validateBody` returns a preHandler that validates request.body against
 * a Zod schema and replaces it with the parsed value (with `.default()`
 * and `.transform()` applied). On failure, throws a ZodError — the global
 * error handler converts it to a 400 response.
 *
 * Same shape for query and params.
 */

import type { FastifyReply, FastifyRequest } from "fastify";
import { z, type ZodTypeAny } from "zod";

export type PreHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<void> | void;

export function validateBody<T>(schema: ZodTypeAny): PreHandler {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      // Throw raw ZodError — error handler will shape the response.
      throw result.error;
    }
    // safeParse succeeded — re-parse to assign the typed value back.
    request.body = result.data as never;
  };
}

export function validateQuery<T>(schema: ZodTypeAny): PreHandler {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const result = schema.safeParse(request.query);
    if (!result.success) {
      throw result.error;
    }
    (request as { validatedQuery?: T }).validatedQuery = result.data as T;
  };
}

export function validateParams<T>(schema: ZodTypeAny): PreHandler {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const result = schema.safeParse(request.params);
    if (!result.success) {
      throw result.error;
    }
    request.params = result.data as never;
  };
}

export type { z };

/**
 * Global error handler.
 *
 * Standard response shape: { error: string, code?: string, details?: any }
 * Status codes:
 *   400  validation errors (Zod + our ValidationError)
 *   401  missing / invalid auth
 *   403  RBAC denial
 *   404  not found
 *   409  conflict (uniqueness, etc.)
 *   500  server / unexpected
 *
 * We deliberately do NOT leak stack traces or internal messages to clients.
 */

import type { FastifyInstance, FastifyError, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { ZodError } from "zod";
import { AppError } from "../utils/errors.js";

interface ErrorResponseBody {
  error: string;
  code?: string;
  details?: unknown;
}

function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

function buildResponseBody(
  message: string,
  code: string | undefined,
  details: unknown,
  includeDetails: boolean,
): ErrorResponseBody {
  const body: ErrorResponseBody = { error: message };
  if (code !== undefined) body.code = code;
  if (includeDetails && details !== undefined) body.details = details;
  return body;
}

const errorPlugin = fp(
  async (app: FastifyInstance): Promise<void> => {
    app.setErrorHandler(
      (err: FastifyError, request: FastifyRequest, reply: FastifyReply): void => {
        // 1. Our own typed errors
        if (isAppError(err)) {
          request.log.warn(
            { err: { code: err.code, status: err.statusCode } },
            err.message,
          );
          const body = buildResponseBody(
            err.message,
            err.code,
            err.details,
            process.env.NODE_ENV !== "production",
          );
          void reply.status(err.statusCode).send(body);
          return;
        }

        // 2. Zod validation errors thrown manually (not used by the schema
        //    validator hooks, but supported for service-layer validation).
        if (err instanceof ZodError) {
          request.log.warn({ err: { issues: err.issues } }, "Validation failed");
          void reply.status(400).send(
            buildResponseBody("Validation failed", "VALIDATION_ERROR", err.issues, true),
          );
          return;
        }

        // 3. Fastify validation (e.g. schema validator failure)
        const fastifyErr = err as FastifyError & {
          validation?: unknown;
          statusCode?: number;
        };
        if (fastifyErr.validation) {
          void reply.status(400).send(
            buildResponseBody("Validation failed", "VALIDATION_ERROR", fastifyErr.validation, true),
          );
          return;
        }

        // 4. JWT errors from @fastify/jwt
        if (fastifyErr.statusCode === 401 || /jwt/i.test(fastifyErr.code ?? "")) {
          void reply.status(401).send(
            buildResponseBody("Unauthorized", "UNAUTHORIZED", undefined, false),
          );
          return;
        }

        // 5. Anything else — treat as 500 and log fully
        request.log.error({ err }, "Unhandled error");
        const message =
          process.env.NODE_ENV === "production"
            ? "Internal server error"
            : err.message;
        void reply.status(fastifyErr.statusCode ?? 500).send(
          buildResponseBody(message, "SERVER_ERROR", undefined, process.env.NODE_ENV !== "production"),
        );
      },
    );

    // 404 handler
    app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply): void => {
      void reply.status(404).send({
        error: `Route ${request.method} ${request.url} not found`,
        code: "NOT_FOUND",
      });
    });
  },
  { name: "error" },
);

export default errorPlugin;

/**
 * DocuSign signature routes.
 *
 * Mounted at /signatures/* by `app.ts`. All endpoints except
 * `GET /signatures/templates` (used by the "send for signature"
 * picker, which is open to authenticated users) require a
 * tenant context. The webhook is a separate router under
 * /webhooks/docusign and is HMAC-verified.
 *
 * Endpoints:
 *   GET    /signatures/templates               — list available templates
 *   POST   /signatures/envelopes                — create + send envelope
 *   GET    /signatures/envelopes                — list (filterable)
 *   GET    /signatures/envelopes/:id            — get one (optional ?sync=1)
 *   POST   /signatures/envelopes/:id/void       — void envelope
 *   POST   /signatures/envelopes/:id/embedded-url — embedded signing URL
 *   GET    /signatures/envelopes/:id/pdf        — download signed PDF
 *   GET    /deals/:id/signatures                — list envelopes for a deal
 *
 * Auth model:
 *   - authenticate() decorator on every route
 *   - ADMIN / MANAGER / FINANCE required for `void`
 *   - Webhook URL injected by the route layer (PUBLIC_URL +
 *     DOCUSIGN_WEBHOOK_PATH)
 *
 * Error contract:
 *   - 400 — Zod validation
 *   - 401 — missing/invalid token
 *   - 403 — role denied
 *   - 404 — envelope/deal not found (or wrong tenant)
 *   - 502 — DocuSign upstream error (envelope creation failed)
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  CreateEnvelopeBodySchema,
  EmbeddedUrlBodySchema,
  EmbeddedUrlResponseSchema,
  EnvelopeIdParamSchema,
  GetEnvelopeQuerySchema,
  ListEnvelopesQuerySchema,
  TemplateListResponseSchema,
  VoidBodySchema,
} from "../schemas/signature.schema.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../utils/validate.js";
import { AuthError } from "../utils/errors.js";
import { signatureService } from "../services/signature.service.js";
import { listTemplates } from "../integrations/docusign/templates.js";
import { prisma } from "../utils/prisma.js";
import { z } from "zod";

/* ============================================================
 * Helpers
 * ============================================================ */

interface AccessPayload {
  userId: string;
  dealerId: string;
  role: string;
}

function requireTenant(request: FastifyRequest): AccessPayload {
  if (!request.tenant) {
    throw new AuthError("Tenant context required");
  }
  return {
    userId: request.tenant.userId,
    dealerId: request.tenant.dealerId,
    role: request.tenant.role,
  };
}

function buildWebhookUrl(): string | undefined {
  const base = process.env.PUBLIC_URL?.replace(/\/+$/, "");
  const path = process.env.DOCUSIGN_WEBHOOK_PATH ?? "/webhooks/docusign";
  if (!base) return undefined;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/* ============================================================
 * Routes
 * ============================================================ */

export async function signatureRoutes(app: FastifyInstance): Promise<void> {
  // ----------------------------------------------------------
  // GET /signatures/templates — list available DocuSign templates
  // ----------------------------------------------------------
  app.get(
    "/templates",
    {
      preHandler: [app.authenticate],
      schema: {
        response: { 200: z.object({ data: TemplateListResponseSchema }) },
      },
    },
    async (_request, reply) => {
      const templates = listTemplates();
      return reply.send({ data: templates });
    },
  );

  // ----------------------------------------------------------
  // POST /signatures/envelopes — create + send
  // ----------------------------------------------------------
  app.post(
    "/envelopes",
    {
      preHandler: [app.authenticate, validateBody(CreateEnvelopeBodySchema)],
    },
    async (request, reply) => {
      const ctx = requireTenant(request);
      const body = request.body as z.infer<typeof CreateEnvelopeBodySchema>;
      const result = await signatureService.create(
        {
          userId: ctx.userId,
          dealerId: ctx.dealerId,
          role: ctx.role,
          ipAddress: request.requestContext?.ipAddress ?? null,
          userAgent: request.requestContext?.userAgent ?? null,
          requestId: request.requestContext?.requestId ?? null,
        },
        {
          dealerId: ctx.dealerId,
          dealId: body.dealId ?? null,
          documentId: body.documentId ?? null,
          templateSlug: body.templateSlug,
          signers: body.signers,
          mergeFields: (body.mergeFields as Record<string, string | number | null | undefined>) ?? {},
          emailSubject: body.emailSubject,
          emailMessage: body.emailMessage,
          sendNow: body.sendNow,
          webhookUrl: body.webhookUrl ?? buildWebhookUrl(),
          metadata: body.metadata as Record<string, unknown> | undefined,
        },
      );
      return reply.status(201).send({ data: result });
    },
  );

  // ----------------------------------------------------------
  // GET /signatures/envelopes — list (filterable)
  // ----------------------------------------------------------
  app.get(
    "/envelopes",
    {
      preHandler: [app.authenticate, validateQuery(ListEnvelopesQuerySchema)],
    },
    async (request, reply) => {
      const ctx = requireTenant(request);
      const q = (request as unknown as { validatedQuery: z.infer<typeof ListEnvelopesQuerySchema> })
        .validatedQuery;
      const rows = await signatureService.list(
        {
          userId: ctx.userId,
          dealerId: ctx.dealerId,
          role: ctx.role,
          ipAddress: request.requestContext?.ipAddress ?? null,
          userAgent: request.requestContext?.userAgent ?? null,
          requestId: request.requestContext?.requestId ?? null,
        },
        {
          dealId: q.dealId,
          documentType: q.documentType,
          status: q.status,
        },
      );
      // Truncate to the requested limit.
      const data = rows.slice(0, q.limit);
      return reply.send({ data, pagination: { hasMore: rows.length > data.length, count: data.length } });
    },
  );

  // ----------------------------------------------------------
  // GET /signatures/envelopes/:id — get one
  // ----------------------------------------------------------
  app.get(
    "/envelopes/:id",
    {
      preHandler: [
        app.authenticate,
        validateParams(EnvelopeIdParamSchema),
        validateQuery(GetEnvelopeQuerySchema),
      ],
    },
    async (request, reply) => {
      const ctx = requireTenant(request);
      const { id } = request.params as z.infer<typeof EnvelopeIdParamSchema>;
      const q = (request as unknown as { validatedQuery: z.infer<typeof GetEnvelopeQuerySchema> })
        .validatedQuery;
      const result = await signatureService.getById(
        {
          userId: ctx.userId,
          dealerId: ctx.dealerId,
          role: ctx.role,
          ipAddress: request.requestContext?.ipAddress ?? null,
          userAgent: request.requestContext?.userAgent ?? null,
          requestId: request.requestContext?.requestId ?? null,
        },
        id,
        { syncFromDocuSign: q.sync },
      );
      return reply.send({ data: result });
    },
  );

  // ----------------------------------------------------------
  // POST /signatures/envelopes/:id/void
  // ----------------------------------------------------------
  app.post(
    "/envelopes/:id/void",
    {
      preHandler: [
        app.authenticate,
        validateParams(EnvelopeIdParamSchema),
        validateBody(VoidBodySchema),
      ],
    },
    async (request, reply) => {
      const ctx = requireTenant(request);
      const { id } = request.params as z.infer<typeof EnvelopeIdParamSchema>;
      const body = request.body as z.infer<typeof VoidBodySchema>;
      const result = await signatureService.void(
        {
          userId: ctx.userId,
          dealerId: ctx.dealerId,
          role: ctx.role,
          ipAddress: request.requestContext?.ipAddress ?? null,
          userAgent: request.requestContext?.userAgent ?? null,
          requestId: request.requestContext?.requestId ?? null,
        },
        id,
        { dealerId: ctx.dealerId, userId: ctx.userId, reason: body.reason, callerRole: ctx.role },
      );
      return reply.send({ data: result });
    },
  );

  // ----------------------------------------------------------
  // POST /signatures/envelopes/:id/embedded-url
  // ----------------------------------------------------------
  app.post(
    "/envelopes/:id/embedded-url",
    {
      preHandler: [
        app.authenticate,
        validateParams(EnvelopeIdParamSchema),
        validateBody(EmbeddedUrlBodySchema),
      ],
    },
    async (request, reply) => {
      const ctx = requireTenant(request);
      const { id } = request.params as z.infer<typeof EnvelopeIdParamSchema>;
      const body = request.body as z.infer<typeof EmbeddedUrlBodySchema>;
      const result = await signatureService.getEmbeddedUrl(
        {
          userId: ctx.userId,
          dealerId: ctx.dealerId,
          role: ctx.role,
          ipAddress: request.requestContext?.ipAddress ?? null,
          userAgent: request.requestContext?.userAgent ?? null,
          requestId: request.requestContext?.requestId ?? null,
        },
        id,
        {
          dealerId: ctx.dealerId,
          userId: ctx.userId,
          callerRole: ctx.role,
          signerEmail: body.signerEmail,
          returnUrl: body.returnUrl,
          authenticationMethod: body.authenticationMethod,
        },
      );
      const payload: z.infer<typeof EmbeddedUrlResponseSchema> = {
        url: result.url,
        expiresAt: result.expiresAt,
        signer: result.signer,
      };
      return reply.send({ data: payload });
    },
  );

  // ----------------------------------------------------------
  // GET /signatures/envelopes/:id/pdf — download signed PDF
  // ----------------------------------------------------------
  app.get(
    "/envelopes/:id/pdf",
    {
      preHandler: [app.authenticate, validateParams(EnvelopeIdParamSchema)],
    },
    async (request, reply) => {
      const ctx = requireTenant(request);
      const { id } = request.params as z.infer<typeof EnvelopeIdParamSchema>;

      // Make sure the row exists and belongs to the dealer (404 vs 403).
      const row = await prisma.documentSignature.findFirst({
        where: { id, dealerId: ctx.dealerId },
        select: { id: true, status: true, envelopeId: true },
      });
      if (!row) {
        return reply.status(404).send({ error: "Envelope not found" });
      }

      const pdf = await signatureService.downloadPdf(
        {
          userId: ctx.userId,
          dealerId: ctx.dealerId,
          role: ctx.role,
          ipAddress: request.requestContext?.ipAddress ?? null,
          userAgent: request.requestContext?.userAgent ?? null,
          requestId: request.requestContext?.requestId ?? null,
        },
        id,
      );

      return reply
        .header("content-type", pdf.mimeType)
        .header(
          "content-disposition",
          `attachment; filename="${pdf.filename}"; filename*=UTF-8''${encodeURIComponent(pdf.filename)}`,
        )
        .header("cache-control", "no-store")
        .send(Buffer.from(pdf.base64, "base64"));
    },
  );

  // ----------------------------------------------------------
  // GET /deals/:id/signatures — list envelopes for a deal
  //
  // (The actual route is mounted under /deals in app.ts; the
  // handler is here so the signatures service is the single
  // owner. See routes/deals.ts for the wrapper.)
  // ----------------------------------------------------------
}

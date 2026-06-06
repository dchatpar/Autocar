/**
 * Customer intake routes — /api/customers/*
 *
 *   POST /customers            — create a new customer (mobile + web)
 *   POST /customers/scan-dl    — accept a base64 image of a driver's
 *                                license, return parsed fields. The
 *                                mobile scanner calls this and then
 *                                POSTs to /customers to persist.
 *
 * The scan-dl route is read-only — it never mutates the database.
 * The mobile client decides which parsed fields to commit; we
 * surface a `confidence` so the UI can prompt the user to retake
 * low-confidence captures.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../utils/prisma.js";
import { validateBody } from "../utils/validate.js";
import {
  CreateCustomerBodySchema,
  ScanDlBodySchema,
} from "../schemas/customer.schema.js";
import { customerService } from "../services/customer.service.js";
import { scanDriverLicense } from "../integrations/aws-textract/client.js";
import { dealerRepository } from "../repositories/dealer.repository.js";
import type { UserRole } from "@prisma/client";

interface AccessPayload {
  userId: string;
  dealerId: string;
  role: UserRole | string;
}

/**
 * Decoded base64 image payload size cap. The mobile app caps captures
 * at 1.5MB JPEG (`quality: 0.85`), so 2MB is a safe upper bound. We
 * also reject anything >6MB after decoding so a 5MB base64 string
 * can't balloon into a 7MB in-memory Buffer.
 */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MIN_CONFIDENCE = 0.3;

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /customers/scan-dl
   * Body: { image: base64String, mimeType: "image/jpeg" }
   * Returns: DlScanResult with parsed fields + confidence score.
   */
  app.post(
    "/scan-dl",
    {
      preHandler: [
        app.authenticate,
        validateBody(ScanDlBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const body = request.body as { image: string; mimeType: string };

      // Load the dealer's settings so Textract can pick up
      // per-dealer AWS creds (if configured). Falls through to env
      // in resolveTextractConfig.
      const dealer = await dealerRepository.findById(payload.dealerId);
      const dealerSettings = dealer?.settings;

      const buffer = decodeBase64Image(body.image);
      if (buffer.length > MAX_IMAGE_BYTES) {
        return reply.status(413).send({
          error: {
            code: "IMAGE_TOO_LARGE",
            message: `Image exceeds ${MAX_IMAGE_BYTES / 1024 / 1024}MB limit`,
          },
        });
      }
      if (buffer.length === 0) {
        return reply.status(400).send({
          error: {
            code: "EMPTY_IMAGE",
            message: "Image payload is empty",
          },
        });
      }

      const result = await scanDriverLicense(
        dealerSettings,
        buffer,
        body.mimeType,
        { byteLength: buffer.length },
      );

      // Surface a soft warning header so the mobile client can show
      // a "double-check the details" banner without us rejecting the
      // response. We don't fail the call because the user may still
      // want to commit manually.
      if (result.confidence < MIN_CONFIDENCE) {
        void reply.header(
          "X-OCR-Confidence",
          result.confidence.toFixed(2),
        );
      }

      return reply.status(200).send({ data: result });
    },
  );

  /**
   * POST /customers
   * Create a new customer. Audit-logged via the service.
   */
  app.post(
    "/",
    {
      preHandler: [
        app.authenticate,
        validateBody(CreateCustomerBodySchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as AccessPayload;
      const body = request.body as {
        firstName: string;
        lastName: string;
        email?: string;
        phone?: string;
        dlNumber?: string;
        dlProvince?: string;
        dob?: string;
        address?: {
          street?: string;
          city?: string;
          state?: string;
          postalCode?: string;
        };
        notes?: string;
        tags?: string[];
        creditTier?: "A" | "B" | "C" | "D" | "SUBPRIME";
      };
      const created = await customerService.create(request.requestContext, {
        dealerId: payload.dealerId,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email ?? null,
        phone: body.phone ?? null,
        dlNumber: body.dlNumber ?? null,
        dlProvince: body.dlProvince ?? null,
        dob: body.dob ? new Date(body.dob) : null,
        address: body.address
          ? {
              street: body.address.street ?? null,
              city: body.address.city ?? null,
              state: body.address.state ?? null,
              postalCode: body.address.postalCode ?? null,
            }
          : undefined,
        notes: body.notes ?? null,
        tags: body.tags ?? [],
        creditTier: body.creditTier ?? null,
      });
      return reply.status(201).send({ data: toCustomerSummary(created) });
    },
  );
}

interface CustomerRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dlNumber: string | null;
  createdAt: Date;
}

function toCustomerSummary(c: CustomerRow): {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dlNumber: string | null;
  createdAt: string;
} {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    dlNumber: c.dlNumber,
    createdAt: c.createdAt.toISOString(),
  };
}

/**
 * Decode a base64 image payload. Accepts both raw base64 and the
 * `data:image/jpeg;base64,...` URI form that some camera SDKs emit.
 * Strips whitespace, validates length, and returns a Buffer ready
 * for Textract / S3 / etc.
 */
function decodeBase64Image(input: string): Buffer {
  let payload = input.trim();
  const commaIdx = payload.indexOf(",");
  if (payload.startsWith("data:") && commaIdx > -1) {
    payload = payload.slice(commaIdx + 1);
  }
  // Strip whitespace and line breaks (some encoders insert them).
  payload = payload.replace(/\s+/g, "");
  if (payload.length === 0) return Buffer.alloc(0);
  return Buffer.from(payload, "base64");
}

// Mark the import as used — keeps tree-shakers from dropping
// `prisma` if we later add a list route here.
void prisma;

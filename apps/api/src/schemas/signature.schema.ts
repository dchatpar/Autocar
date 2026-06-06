/**
 * Zod schemas for the DocuSign e-signature endpoints.
 *
 * These mirror the request/response shape used by
 * `services/signature.service.ts` and `routes/signatures.ts`.
 *
 * Field names follow camelCase throughout (deal.assignedToId,
 * envelope.embeddedUrl.expiresAt) — frontend code never has to
 * translate snake_case.
 */

import { z } from "zod";

/* ============================================================
 * Enums (mirrored from prisma so we don't import @prisma/client)
 * ============================================================ */

export const SignatureStatusSchema = z.enum([
  "CREATED",
  "SENT",
  "DELIVERED",
  "COMPLETED",
  "DECLINED",
  "VOIDED",
  "EXPIRED",
]);
export type SignatureStatusZ = z.infer<typeof SignatureStatusSchema>;

export const DocumentTypeSchema = z.enum([
  "BILL_OF_SALE",
  "FI_CONTRACT",
  "CREDIT_APP",
  "WARRANTY",
  "DISCLOSURE",
  "TRADE_APPRAISAL",
  "DELIVERY_RECEIPT",
  "OTHER",
]);
export type DocumentTypeZ = z.infer<typeof DocumentTypeSchema>;

/* ============================================================
 * Signer inputs
 * ============================================================ */

export const SignerInputSchema = z.object({
  roleName: z.string().min(1, "roleName is required"),
  email: z.string().email("valid email required"),
  name: z.string().min(1, "name is required"),
  clientUserId: z.string().min(1).optional(),
});
export type SignerInputZ = z.infer<typeof SignerInputSchema>;

export const SignerViewSchema = z.object({
  email: z.string(),
  name: z.string(),
  role: z.string(),
  status: z.enum(["created", "sent", "delivered", "completed", "declined"]),
  signedAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  declinedAt: z.string().nullable(),
  declineReason: z.string().nullable(),
  clientUserId: z.string().nullable(),
});
export type SignerViewZ = z.infer<typeof SignerViewSchema>;

/* ============================================================
 * Envelope view + request
 * ============================================================ */

export const EnvelopeViewSchema = z.object({
  id: z.string(),
  dealerId: z.string(),
  dealId: z.string().nullable(),
  documentId: z.string().nullable(),
  envelopeId: z.string(),
  templateId: z.string(),
  documentType: DocumentTypeSchema,
  status: SignatureStatusSchema,
  subject: z.string().nullable(),
  emailMessage: z.string().nullable(),
  signers: z.array(SignerViewSchema),
  sentAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  declinedAt: z.string().nullable(),
  declinedReason: z.string().nullable(),
  voidedAt: z.string().nullable(),
  voidedReason: z.string().nullable(),
  expiresAt: z.string().nullable(),
  pdfUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type EnvelopeViewZ = z.infer<typeof EnvelopeViewSchema>;

/* ============================================================
 * Merge fields
 *
 * Loose object — keys are the `{{placeholder}}` names. We
 * validate that every key is recognised at the service layer
 * (see `findUnknownMergeFields`).
 * ============================================================ */

export const MergeFieldsSchema = z
  .record(z.union([z.string(), z.number()]).nullable())
  .optional();

/* ============================================================
 * POST /signatures/envelopes
 * ============================================================ */

export const CreateEnvelopeBodySchema = z.object({
  templateSlug: z.string().min(1, "templateSlug is required"),
  dealId: z.string().min(1).optional().nullable(),
  documentId: z.string().min(1).optional().nullable(),
  signers: z.array(SignerInputSchema).min(1, "at least one signer is required"),
  mergeFields: MergeFieldsSchema,
  emailSubject: z.string().min(1).max(200).optional(),
  emailMessage: z.string().min(1).max(2000).optional(),
  sendNow: z.boolean().optional(),
  webhookUrl: z.string().url().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type CreateEnvelopeBody = z.infer<typeof CreateEnvelopeBodySchema>;

/* ============================================================
 * GET /signatures/envelopes/:id  (and ?sync=1)
 * ============================================================ */

export const EnvelopeIdParamSchema = z.object({
  id: z.string().min(1, "envelope id is required"),
});

export const GetEnvelopeQuerySchema = z.object({
  sync: z
    .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

/* ============================================================
 * GET /signatures/envelopes  (list)
 * ============================================================ */

export const ListEnvelopesQuerySchema = z.object({
  dealId: z.string().optional(),
  documentType: DocumentTypeSchema.optional(),
  status: SignatureStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/* ============================================================
 * GET /deals/:id/signatures
 *
 * Returns envelopes scoped to a single deal. Used by the
 * `/deals/[id]/signatures` page.
 * ============================================================ */

export const DealIdParamSchema = z.object({
  id: z.string().min(1),
});

/* ============================================================
 * POST /signatures/envelopes/:id/void
 * ============================================================ */

export const VoidBodySchema = z.object({
  reason: z.string().min(1, "void reason is required").max(500),
});

/* ============================================================
 * POST /signatures/envelopes/:id/embedded-url
 * ============================================================ */

export const EmbeddedUrlBodySchema = z.object({
  signerEmail: z.string().email("signer email is required"),
  returnUrl: z.string().url("returnUrl must be a valid URL"),
  authenticationMethod: z
    .enum(["none", "email", "biometric", "sms", "phone"])
    .optional(),
});

export const EmbeddedUrlResponseSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string().nullable(),
  signer: SignerViewSchema,
});

/* ============================================================
 * GET /signatures/templates
 * ============================================================ */

export const TemplateListItemSchema = z.object({
  slug: z.string(),
  documentType: DocumentTypeSchema,
  displayName: z.string(),
  description: z.string(),
  roles: z.array(
    z.object({
      name: z.string(),
      required: z.boolean(),
      description: z.string(),
    }),
  ),
  signingOrder: z.enum(["sequential", "parallel"]),
  mergeFields: z.array(z.string()),
  configured: z.boolean(),
});

export const TemplateListResponseSchema = z.array(TemplateListItemSchema);

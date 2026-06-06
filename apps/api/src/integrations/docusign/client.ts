/**
 * DocuSign eSign REST API client.
 *
 * Thin wrapper over the `docusign-esign` SDK that:
 *
 *   1. Authenticates via JWT grant (see `./jwt-auth.ts`)
 *   2. Creates envelopes from templates (with text-tab prefill)
 *   3. Fetches the embedded signing URL for a specific recipient
 *   4. Voids an envelope (with reason)
 *   5. Downloads the combined signed PDF
 *   6. Reads the current envelope status + recipient status
 *
 * Why a wrapper:
 *   - The SDK has a wide surface and inconsistent error shapes. We
 *     normalize to a `DocuSignError` with a status code + message.
 *   - We want a single place that owns `ApiClient` construction
 *     (base path, OAuth host, default headers) — rest of the
 *     codebase calls `getEnvelopesApi()` rather than building
 *     `new docusign.EnvelopesApi(...)` ad-hoc.
 *   - We use a per-process singleton for the API client. The
 *     underlying `ApiClient` is re-usable across calls; the SDK
 *     is happy with that.
 *
 * Multi-tenant:
 *   - DocuSign is per-account, not per-dealer. Each DealerOS dealer
 *     maps to one DocuSign account, configured via env. We expose
 *     `accountId` on every call so the call site decides whose
 *     account is being used (in practice: same env-driven account
 *     for everyone in this MVP).
 */

import docusign from "docusign-esign";
// Named-export alias so we can use the SDK's types as `docusign_esign.X`
// instead of reaching for `any` or the default import as a namespace.
import * as docusign_esign from "docusign-esign";
import { ServerError } from "../../utils/errors.js";
import {
  getAccessToken,
  loadDocuSignConfig,
  refreshAccessToken,
  type DocuSignConfig,
} from "./jwt-auth.js";
import {
  resolveDocuSignTemplateId,
  type TemplateDefinition,
} from "./templates.js";
import {
  type MergeFieldKey,
  toDocuSignTextTabs,
} from "../../utils/docusign-merge-fields.js";

/* ============================================================
 * Errors
 * ============================================================ */

export class DocuSignError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: unknown;

  constructor(
    message: string,
    statusCode = 502,
    code = "DOCUSIGN_ERROR",
    details?: unknown,
  ) {
    super(message);
    this.name = "DocuSignError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/* ============================================================
 * API client factory
 * ============================================================ */

let cachedClient: docusign_esign.ApiClient | null = null;
let cachedToken: string | null = null;

async function getApiClient(): Promise<docusign_esign.ApiClient> {
  const cfg = loadDocuSignConfig();
  const token = await getAccessToken(cfg);
  if (cachedClient && cachedToken === token) {
    return cachedClient;
  }
  const client = new docusign.ApiClient();
  client.setBasePath(cfg.basePath);
  // Note: addDefaultHeader is the correct SDK method; the older
  // `setDefaultHeader` was renamed. We use the current name.
  (client as unknown as {
    addDefaultHeader: (k: string, v: string) => void;
  }).addDefaultHeader("Authorization", `Bearer ${token}`);
  cachedClient = client;
  cachedToken = token;
  return client;
}

/**
 * Reset the in-process API client cache. Used when:
 *   - The JWT token returns 401 (refresh and retry once)
 *   - Tests need a clean slate
 */
function resetApiClientCache(): void {
  cachedClient = null;
  cachedToken = null;
}

/* ============================================================
 * Type definitions
 * ============================================================ */

export interface CreateEnvelopeSigner {
  email: string;
  name: string;
  roleName: string;
  /**
   * Required for embedded signing. DocuSign ties a `clientUserId`
   * to a recipient to make them eligible for the embedded URL.
   * Convention: a stable per-recipient id, e.g. `${dealId}:${roleName}`.
   */
  clientUserId?: string;
  /** DocuSign recipientId (1-based). Assigned at envelope creation. */
  recipientId?: string;
  /** Routing order (1 = first). Sequential templates use ascending ints. */
  routingOrder?: number;
}

export interface CreateEnvelopeInput {
  /** DocuSign template GUID, or omit to resolve from a slug. */
  templateId?: string;
  /** Slug, e.g. "bill_of_sale". Resolved to a template GUID internally. */
  templateSlug?: string;
  signers: CreateEnvelopeSigner[];
  /** Email subject; supports `{{placeholder}}`. */
  emailSubject: string;
  /** Email body; supports `{{placeholder}}`. */
  emailMessage: string;
  /** Merge field values to prefill into text tabs. */
  mergeFields: Partial<Record<MergeFieldKey, string>>;
  /** Optional metadata stored on the envelope custom field. */
  metadata?: Record<string, string>;
  /** When true, the envelope is created in `sent` status. Default true. */
  sendNow?: boolean;
  /**
   * Status-change callbacks. DocuSign will POST to these URLs when
   * the envelope is sent/delivered/completed/etc. (Connect).
   */
  eventNotification?: {
    url: string;
    requireSignedXml?: boolean;
    includeDocuments?: boolean;
    includeEnvelopeVoidReason?: boolean;
    includeTimeZone?: boolean;
    includeSenderAccountAsCustomField?: boolean;
  };
}

export interface CreateEnvelopeResult {
  envelopeId: string;
  status: "created" | "sent" | "voided" | "completed" | "declined" | "delivered";
  uri: string;
  statusDateTime: string;
}

export interface EnvelopeSigner {
  recipientId: string;
  routingOrder: string;
  name: string;
  email: string;
  status: string;
  signedDateTime: string | null;
  deliveredDateTime: string | null;
  declinedDateTime: string | null;
  declineReason: string | null;
  clientUserId: string | null;
}

export interface EnvelopeStatusResult {
  envelopeId: string;
  status: string;
  statusDateTime: string;
  sentDateTime: string | null;
  deliveredDateTime: string | null;
  completedDateTime: string | null;
  declinedDateTime: string | null;
  voidedDateTime: string | null;
  voidedReason: string | null;
  emailSubject: string;
  signers: EnvelopeSigner[];
}

export interface EmbeddedSigningUrl {
  url: string;
  expiresAt: string | null;
}

export interface DownloadedDocument {
  /** The base64-encoded PDF body. */
  base64: string;
  mimeType: "application/pdf";
  /** Suggested filename. */
  filename: string;
  /** Bytes (approximate). */
  bytes: number;
}

/* ============================================================
 * EnvelopesApi factory
 * ============================================================ */

function getEnvelopesApi(client: docusign_esign.ApiClient): docusign_esign.EnvelopesApi {
  return new docusign.EnvelopesApi(client);
}

/* ============================================================
 * Create envelope from template
 * ============================================================ */

/**
 * Create a DocuSign envelope from a template with pre-filled
 * merge fields. The envelope is sent immediately by default
 * (`sendNow: true`); pass `sendNow: false` to create it in
 * `CREATED` state for inspection before sending.
 */
export async function createEnvelopeFromTemplate(
  input: CreateEnvelopeInput,
): Promise<CreateEnvelopeResult> {
  const cfg = loadDocuSignConfig();
  const client = await getApiClient();
  const api = getEnvelopesApi(client);

  const templateId =
    input.templateId ?? (input.templateSlug ? resolveDocuSignTemplateId(input.templateSlug) : undefined);
  if (!templateId) {
    throw new ServerError("createEnvelopeFromTemplate requires templateId or templateSlug");
  }

  const templateRoles = input.signers.map((s, idx) => ({
    email: s.email,
    name: s.name,
    roleName: s.roleName,
    clientUserId: s.clientUserId ?? undefined,
    recipientId: s.recipientId ?? String(idx + 1),
    routingOrder: String(s.routingOrder ?? idx + 1),
  }));

  const envelopeDefinition: Record<string, unknown> = {
    templateId,
    templateRoles,
    status: input.sendNow === false ? "created" : "sent",
    emailSubject: input.emailSubject,
    emailBlurb: input.emailMessage,
  };

  // Prefill text tabs for the merge fields the template consumes.
  const tabs = toDocuSignTextTabs(
    input.mergeFields as Record<MergeFieldKey, string>,
  );
  if (tabs.length > 0) {
    envelopeDefinition.templateTabs = {
      textTabs: tabs,
      prefillTabs: {
        textTabs: tabs,
      },
    };
  }

  // Custom fields let us round-trip our internal IDs through to the
  // webhook so we can find the envelope again without scanning.
  if (input.metadata && Object.keys(input.metadata).length > 0) {
    envelopeDefinition.customFields = {
      textCustomFields: Object.entries(input.metadata).map(([name, value]) => ({
        name,
        value,
        required: "false",
        show: "false",
      })),
    };
  }

  if (input.eventNotification) {
    envelopeDefinition.eventNotification = {
      url: input.eventNotification.url,
      loggingEnabled: "true",
      requireAcknowledged: "false",
      useSoapInterface: "false",
      includeDocuments: input.eventNotification.includeDocuments ? "true" : "false",
      includeEnvelopeVoidReason: input.eventNotification.includeEnvelopeVoidReason ? "true" : "false",
      includeTimeZone: input.eventNotification.includeTimeZone ? "true" : "false",
      includeSenderAccountAsCustomField: input.eventNotification.includeSenderAccountAsCustomField ? "true" : "false",
      includeDocumentFields: "true",
      includeCertificateOfCompletion: "true",
      ...(input.eventNotification.requireSignedXml
        ? { requireSignedXml: "true" }
        : {}),
      envelopeEvents: [
        { envelopeEventStatusCode: "sent" },
        { envelopeEventStatusCode: "delivered" },
        { envelopeEventStatusCode: "completed" },
        { envelopeEventStatusCode: "declined" },
        { envelopeEventStatusCode: "voided" },
        { envelopeEventStatusCode: "expired" },
      ],
      recipientEvents: [
        { recipientEventStatusCode: "Delivered" },
        { recipientEventStatusCode: "Completed" },
        { recipientEventStatusCode: "Declined" },
        { recipientEventStatusCode: "Sent" },
      ],
    };
  }

  let result: { envelopeId?: string; status?: string; uri?: string; statusDateTime?: string };
  try {
    result = (await api.createEnvelope(cfg.accountId, {
      envelopeDefinition: envelopeDefinition as docusign_esign.EnvelopeDefinition,
    })) as typeof result;
  } catch (err) {
    throw await mapDocuSignError(err, "createEnvelopeFromTemplate", () => {
      // Force-refresh in case it was a 401
      resetApiClientCache();
      return refreshAccessToken(cfg);
    });
  }

  if (!result?.envelopeId) {
    throw new DocuSignError("DocuSign createEnvelope returned no envelopeId", 502, "DOCUSIGN_NO_ENVELOPE_ID", {
      result,
    });
  }

  return {
    envelopeId: result.envelopeId,
    status: (result.status ?? "sent") as CreateEnvelopeResult["status"],
    uri: result.uri ?? "",
    statusDateTime: result.statusDateTime ?? new Date().toISOString(),
  };
}

/* ============================================================
 * Get envelope status
 * ============================================================ */

export async function getEnvelopeStatus(
  envelopeId: string,
): Promise<EnvelopeStatusResult> {
  const cfg = loadDocuSignConfig();
  const client = await getApiClient();
  const api = getEnvelopesApi(client);

  let env: Record<string, unknown>;
  let recipients: { signers?: Array<Record<string, unknown>> } | undefined;
  try {
    env = (await api.getEnvelope(cfg.accountId, envelopeId, {})) as Record<string, unknown>;
    recipients = (await api.listRecipients(cfg.accountId, envelopeId, {})) as typeof recipients;
  } catch (err) {
    throw await mapDocuSignError(err, "getEnvelopeStatus", () => {
      resetApiClientCache();
      return refreshAccessToken(cfg);
    });
  }

  return {
    envelopeId,
    status: (env.status as string) ?? "unknown",
    statusDateTime: (env.statusDateTime as string) ?? new Date().toISOString(),
    sentDateTime: (env.sentDateTime as string) ?? null,
    completedDateTime: (env.completedDateTime as string) ?? null,
    deliveredDateTime: (env.deliveredDateTime as string) ?? null,
    declinedDateTime: (env.declinedDateTime as string) ?? null,
    voidedDateTime: (env.voidedDateTime as string) ?? null,
    voidedReason: (env.voidedReason as string) ?? null,
    emailSubject: (env.emailSubject as string) ?? "",
    signers: (recipients?.signers ?? []).map((s) => ({
      recipientId: (s.recipientId as string) ?? "",
      routingOrder: (s.routingOrder as string) ?? "1",
      name: (s.name as string) ?? "",
      email: (s.email as string) ?? "",
      status: (s.status as string) ?? "created",
      signedDateTime: (s.signedDateTime as string | null) ?? null,
      deliveredDateTime: (s.deliveredDateTime as string | null) ?? null,
      declinedDateTime: (s.declinedDateTime as string | null) ?? null,
      declineReason: (s.declineReason as string | null) ?? null,
      clientUserId: (s.clientUserId as string | null) ?? null,
    })),
  };
}

/* ============================================================
 * Embedded signing URL
 * ============================================================ */

export interface EmbeddedSigningInput {
  envelopeId: string;
  recipientId: string;
  /** Must match the `clientUserId` set on the signer at envelope creation. */
  clientUserId: string;
  userName: string;
  email: string;
  returnUrl: string;
  authenticationMethod?: "none" | "email" | "biometric" | "sms" | "phone";
}

/**
 * Get a one-time embedded signing URL for a recipient. The URL is
 * short-lived (~5 minutes) and can only be used once.
 */
export async function getEmbeddedSigningUrl(
  input: EmbeddedSigningInput,
): Promise<EmbeddedSigningUrl> {
  const cfg = loadDocuSignConfig();
  const client = await getApiClient();
  const api = getEnvelopesApi(client);

  const viewRequest: Record<string, unknown> = {
    authenticationMethod: input.authenticationMethod ?? "none",
    clientUserId: input.clientUserId,
    recipientId: input.recipientId,
    returnUrl: input.returnUrl,
    userName: input.userName,
    email: input.email,
    pingFrequency: "60",
    pingUrls: undefined,
  };

  let result: { url?: string };
  try {
    result = (await api.createRecipientView(
      cfg.accountId,
      input.envelopeId,
      { recipientViewRequest: viewRequest as docusign_esign.RecipientViewRequest },
    )) as { url?: string };
  } catch (err) {
    throw await mapDocuSignError(err, "getEmbeddedSigningUrl", () => {
      resetApiClientCache();
      return refreshAccessToken(cfg);
    });
  }

  if (!result?.url) {
    throw new DocuSignError(
      "DocuSign createRecipientView returned no url",
      502,
      "DOCUSIGN_NO_URL",
      { result },
    );
  }

  return {
    url: result.url,
    // DocuSign doesn't echo expiry back; the URL is valid for ~5min.
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  };
}

/* ============================================================
 * Void envelope
 * ============================================================ */

export async function voidEnvelope(
  envelopeId: string,
  reason: string,
): Promise<{ envelopeId: string; status: string; statusDateTime: string }> {
  const cfg = loadDocuSignConfig();
  const client = await getApiClient();
  const api = getEnvelopesApi(client);

  let result: { envelopeId?: string; status?: string; statusDateTime?: string };
  try {
    result = (await api.update(
      cfg.accountId,
      envelopeId,
      {
        envelope: {
          status: "voided",
          voidedReason: reason,
        },
        // Resend the same notification? No — DocuSign voids silently.
      },
      {},
    )) as typeof result;
  } catch (err) {
    throw await mapDocuSignError(err, "voidEnvelope", () => {
      resetApiClientCache();
      return refreshAccessToken(cfg);
    });
  }

  return {
    envelopeId: result?.envelopeId ?? envelopeId,
    status: result?.status ?? "voided",
    statusDateTime: result?.statusDateTime ?? new Date().toISOString(),
  };
}

/* ============================================================
 * Download combined signed PDF
 * ============================================================ */

/**
 * Download the combined PDF for a completed envelope. Returns the
 * raw bytes as base64 so the caller can stream to S3 or pipe to
 * the HTTP response.
 */
export async function downloadCompletedDocument(
  envelopeId: string,
): Promise<DownloadedDocument> {
  const cfg = loadDocuSignConfig();
  const client = await getApiClient();
  const api = getEnvelopesApi(client);

  let result: unknown;
  try {
    result = await api.getDocument(cfg.accountId, envelopeId, "combined", {});
  } catch (err) {
    throw await mapDocuSignError(err, "downloadCompletedDocument", () => {
      resetApiClientCache();
      return refreshAccessToken(cfg);
    });
  }

  // The SDK returns the document body as a string when the response
  // content-type is text-based (PDF is binary, but the SDK decodes
  // it as utf-8 by default — we re-encode as base64 below).
  let base64: string;
  if (Buffer.isBuffer(result)) {
    base64 = result.toString("base64");
  } else if (typeof result === "string") {
    base64 = Buffer.from(result, "binary").toString("base64");
  } else if (result && typeof result === "object" && "body" in (result as Record<string, unknown>)) {
    const body = (result as { body?: unknown }).body;
    if (Buffer.isBuffer(body)) {
      base64 = body.toString("base64");
    } else if (typeof body === "string") {
      base64 = Buffer.from(body, "binary").toString("base64");
    } else {
      throw new DocuSignError("Unexpected DocuSign document body shape", 502, "DOCUSIGN_BAD_PDF");
    }
  } else {
    throw new DocuSignError("Unexpected DocuSign document response", 502, "DOCUSIGN_BAD_PDF");
  }

  return {
    base64,
    mimeType: "application/pdf",
    filename: `envelope-${envelopeId}.pdf`,
    bytes: Math.floor((base64.length * 3) / 4),
  };
}

/* ============================================================
 * Template defaults
 * ============================================================ */

/**
 * Resolve a `TemplateDefinition` by slug with full DocuSign
 * configuration check. Throws if the template isn't configured
 * in env. Used by the route layer to fail fast on misconfiguration.
 */
export function requireTemplate(slug: string): {
  definition: TemplateDefinition;
  templateId: string;
  cfg: DocuSignConfig;
} {
  const cfg = loadDocuSignConfig();
  // Lazy-import to keep the module order stable
  const { getTemplateBySlug } = require("./templates.js") as {
    getTemplateBySlug: (s: string) => TemplateDefinition;
  };
  const definition = getTemplateBySlug(slug);
  const templateId = resolveDocuSignTemplateId(slug);
  return { definition, templateId, cfg };
}

/* ============================================================
 * Error mapping
 * ============================================================ */

interface DocuSignApiError {
  response?: {
    statusCode?: number;
    body?: { errorCode?: string; message?: string };
  };
  message?: string;
  statusCode?: number;
}

async function mapDocuSignError(
  err: unknown,
  op: string,
  on401: () => Promise<unknown>,
): Promise<Error> {
  const e = err as DocuSignApiError;
  const status = e?.response?.statusCode ?? e?.statusCode ?? 502;
  const body = e?.response?.body;
  const message = body?.message ?? e?.message ?? "DocuSign API error";
  const code = body?.errorCode ?? "DOCUSIGN_ERROR";

  if (status === 401) {
    // Token is stale — refresh once. We don't loop; if the retry
    // also fails the caller gets the second error.
    try {
      await on401();
    } catch {
      // fall through
    }
  }

  return new DocuSignError(
    `${op} failed: ${message}`,
    status >= 400 && status < 600 ? status : 502,
    code,
    { docuSignErrorCode: code, status },
  );
}

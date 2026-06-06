/**
 * SendGrid Email Client.
 *
 * Wraps SendGrid's v3 Mail Send REST API for DealerOS outbound
 * marketing and transactional email. Used by the campaign step
 * processor and (in future) the AI outbound agent.
 *
 * Why not the official `@sendgrid/mail` SDK?
 *   - We don't need the full SDK surface; a thin fetch wrapper keeps
 *     the dependency footprint small and lets us share the same
 *     dev-mode "synthetic" behaviour as the WhatsApp client.
 *   - In test environments, the SDK is the heaviest single dep —
 *     avoiding it makes the build leaner.
 *
 * Credentials precedence:
 *   1. `dealer.settings.sendgrid_credentials.{api_key, from_email,
 *       from_name, reply_to}`
 *   2. env vars SENDGRID_API_KEY, SENDGRID_FROM_EMAIL,
 *      SENDGRID_FROM_NAME, SENDGRID_REPLY_TO
 *
 * In dev (no creds), `sendEmail` returns a synthetic
 * `{ messageId: "dev_sg_…" }` so the rest of the pipeline keeps
 * moving. The same path is taken in unit tests.
 */

import { envOr, resolveCredential } from "../shared/credentials.js";

const API_BASE = envOr("SENDGRID_API_BASE", "https://api.sendgrid.com");
const API_VERSION = envOr("SENDGRID_API_VERSION", "v3");
const ENDPOINT = `${API_BASE}/${API_VERSION}/mail/send`;

export interface SendResult {
  messageId: string;
  /** True when we returned a dev placeholder because creds are missing. */
  dev: boolean;
}

export interface SendEmailInput {
  to: string;
  toName?: string;
  subject: string;
  /** Plain-text body. */
  text: string;
  /** Optional HTML body. If both are provided, both are sent. */
  html?: string;
  /** Override the from address for this single send. */
  from?: { email: string; name?: string };
  /** Reply-To header override. */
  replyTo?: { email: string; name?: string };
  /** Optional categories for SendGrid analytics. */
  categories?: string[];
  /** Optional custom args / tracking. */
  customArgs?: Record<string, string>;
  /** Disable open / click tracking for this send. */
  disableTracking?: boolean;
}

export interface SendGridCredentials {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string | null;
}

export interface DealerEmailSettings {
  sendgridApiKey?: string;
  sendgridFromEmail?: string;
  sendgridFromName?: string;
  sendgridReplyTo?: string;
}

function resolveCreds(
  dealerSettings: unknown,
): SendGridCredentials | null {
  const apiKeyRes = resolveCredential(
    dealerSettings,
    "sendgrid_api_key",
    "SENDGRID_API_KEY",
  );
  const fromEmailRes = resolveCredential(
    dealerSettings,
    "sendgrid_from_email",
    "SENDGRID_FROM_EMAIL",
  );
  const fromNameRes = resolveCredential(
    dealerSettings,
    "sendgrid_from_name",
    "SENDGRID_FROM_NAME",
  );
  const replyToRes = resolveCredential(
    dealerSettings,
    "sendgrid_reply_to",
    "SENDGRID_REPLY_TO",
  );

  if (!apiKeyRes.value || !fromEmailRes.value) return null;
  return {
    apiKey: apiKeyRes.value,
    fromEmail: fromEmailRes.value,
    fromName: fromNameRes.value ?? "DealerOS",
    replyToEmail: replyToRes.value,
  };
}

function devMessageId(prefix: string): string {
  return `dev_${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface SendGridPersonalization {
  to: Array<{ email: string; name?: string }>;
  subject: string;
}

interface SendGridContent {
  type: string;
  value: string;
}

interface SendGridMailBody {
  personalizations: SendGridPersonalization[];
  from: { email: string; name?: string };
  reply_to?: { email: string; name?: string };
  subject: string;
  content: SendGridContent[];
  categories?: string[];
  custom_args?: Record<string, string>;
  tracking_settings?: {
    click_tracking?: { enable: boolean; enable_text: boolean };
    open_tracking?: { enable: boolean };
  };
}

export class SendGridClient {
  /**
   * Send a single transactional email. Returns the SendGrid
   * `X-Message-Id` header value, or a synthetic dev id if creds are
   * missing.
   *
   * Throws on non-2xx responses. The campaign step processor catches
   * and persists the error to `CampaignStepExecution.errorMessage`.
   */
  async sendEmail(
    dealerSettings: unknown,
    input: SendEmailInput,
  ): Promise<SendResult> {
    if (!input.to || input.to.length === 0) {
      throw new Error("sendEmail: 'to' is required");
    }
    if (!input.subject) {
      throw new Error("sendEmail: 'subject' is required");
    }
    if (!input.text && !input.html) {
      throw new Error("sendEmail: 'text' or 'html' is required");
    }

    const creds = resolveCreds(dealerSettings);
    if (!creds) {
      return { messageId: devMessageId("sg"), dev: true };
    }

    const from = input.from ?? {
      email: creds.fromEmail,
      name: creds.fromName,
    };
    const replyTo =
      input.replyTo ??
      (creds.replyToEmail
        ? { email: creds.replyToEmail, name: creds.fromName }
        : undefined);

    const content: SendGridContent[] = [];
    if (input.text) {
      content.push({ type: "text/plain", value: input.text });
    }
    if (input.html) {
      content.push({ type: "text/html", value: input.html });
    }

    const body: SendGridMailBody = {
      personalizations: [
        {
          to: [{ email: input.to, name: input.toName }],
          subject: input.subject,
        },
      ],
      from,
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: input.subject,
      content,
      ...(input.categories ? { categories: input.categories } : {}),
      ...(input.customArgs ? { custom_args: input.customArgs } : {}),
      ...(input.disableTracking
        ? {
            tracking_settings: {
              click_tracking: { enable: false, enable_text: false },
              open_tracking: { enable: false },
            },
          }
        : {}),
    };

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // SendGrid returns 202 for success; 4xx/5xx throw with the body.
      let detail = "";
      try {
        const payload = (await response.json()) as {
          errors?: Array<{ message?: string }>;
        };
        detail = JSON.stringify(payload);
      } catch {
        detail = await response.text().catch(() => "");
      }
      throw new Error(
        `SendGrid send failed (${response.status}): ${detail || "unknown error"}`,
      );
    }

    // SendGrid returns the X-Message-Id header on the 202 response.
    // If absent, fall back to a synthetic id (rare).
    const headerId = response.headers.get("X-Message-Id");
    return {
      messageId: headerId ?? devMessageId("sg"),
      dev: false,
    };
  }
}

export const sendGridClient = new SendGridClient();

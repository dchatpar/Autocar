/**
 * ContactForm — public lead-capture form. Submits to the
 * marketing app's own /api/lead route, which proxies to the main
 * API's /public/dealer-website/:subdomain/lead endpoint.
 *
 * The form supports an optional `vehicleStockNumber` hidden input
 * so a vehicle detail page can pre-fill the "interested in" field
 * and we can route the lead to the right rep.
 */

"use client";

import { useState } from "react";

interface ContactFormProps {
  subdomain: string;
  vehicleStockNumber?: string;
  vehicleId?: string;
  /** Optional page title to attribute the lead to (e.g. "Homepage"). */
  pageName?: string;
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; leadId: string }
  | { kind: "error"; message: string };

export function ContactForm({
  subdomain,
  vehicleStockNumber,
  vehicleId,
  pageName,
}: ContactFormProps): React.ReactElement {
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setState({ kind: "submitting" });
    const formData = new FormData(e.currentTarget);
    const payload = {
      subdomain,
      firstName: String(formData.get("firstName") ?? "").trim(),
      lastName: String(formData.get("lastName") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim() || undefined,
      message: String(formData.get("message") ?? "").trim() || undefined,
      vehicleStockNumber: vehicleStockNumber || undefined,
      vehicleId: vehicleId || undefined,
      sourceMeta: {
        page: pageName,
        referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
      },
    };

    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { data?: { id?: string }; error?: { message?: string } };
      if (!res.ok || !body.data?.id) {
        setState({
          kind: "error",
          message: body.error?.message ?? "Could not submit your message. Please try again.",
        });
        return;
      }
      setState({ kind: "success", leadId: body.data.id });
      e.currentTarget.reset();
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  if (state.kind === "success") {
    return (
      <div
        className="card border"
        style={{ borderColor: "var(--brand-accent)" }}
        role="status"
        aria-live="polite"
      >
        <h3 className="text-lg font-semibold" style={{ color: "var(--brand-primary)" }}>
          Thanks — we&rsquo;ll be in touch.
        </h3>
        <p className="mt-2 text-sm text-[color:var(--ink-muted)]">
          Your message has been sent to the dealer. A team member will reach out within one
          business day. (Reference #{state.leadId})
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4" aria-label="Contact form">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="contact-first">
            First name
          </label>
          <input
            id="contact-first"
            name="firstName"
            className="input"
            required
            minLength={1}
            maxLength={80}
            autoComplete="given-name"
          />
        </div>
        <div>
          <label className="label" htmlFor="contact-last">
            Last name
          </label>
          <input
            id="contact-last"
            name="lastName"
            className="input"
            required
            minLength={1}
            maxLength={80}
            autoComplete="family-name"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="contact-email">
          Email
        </label>
        <input
          id="contact-email"
          name="email"
          type="email"
          className="input"
          required
          autoComplete="email"
        />
      </div>

      <div>
        <label className="label" htmlFor="contact-phone">
          Phone (optional)
        </label>
        <input
          id="contact-phone"
          name="phone"
          type="tel"
          className="input"
          autoComplete="tel"
        />
      </div>

      <div>
        <label className="label" htmlFor="contact-message">
          How can we help?
        </label>
        <textarea
          id="contact-message"
          name="message"
          className="input"
          rows={4}
          maxLength={2000}
          placeholder="I&rsquo;m interested in scheduling a test drive…"
        />
      </div>

      {vehicleStockNumber ? (
        <p className="text-xs text-[color:var(--ink-muted)]">
          Inquiring about stock #{vehicleStockNumber}
        </p>
      ) : null}

      {state.kind === "error" ? (
        <p className="text-sm" style={{ color: "#ef4444" }} role="alert">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        className="btn-primary w-full"
        disabled={state.kind === "submitting"}
      >
        {state.kind === "submitting" ? "Sending…" : "Send message"}
      </button>

      <p className="text-xs text-[color:var(--ink-muted)]">
        By submitting, you consent to be contacted by the dealer about your inquiry.
      </p>
    </form>
  );
}

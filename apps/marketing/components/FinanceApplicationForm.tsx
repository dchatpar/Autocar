/**
 * FinanceApplicationForm — credit-app form for the public site.
 * Posts to /api/finance-application, which proxies to the main
 * API and creates a Lead + Customer row.
 *
 * SSN is collected as the last 4 digits only — we never transmit
 * a full SSN through the public form. The form carries a soft
 * consent toggle so the lead source meta records the buyer's
 * acknowledgement.
 */

"use client";

import { useState } from "react";

interface FinanceApplicationFormProps {
  subdomain: string;
  vehicleStockNumber?: string;
  vehicleId?: string;
  pageName?: string;
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; leadId: string; customerId: string }
  | { kind: "error"; message: string };

export function FinanceApplicationForm({
  subdomain,
  vehicleStockNumber,
  vehicleId,
  pageName,
}: FinanceApplicationFormProps): React.ReactElement {
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setState({ kind: "submitting" });
    const fd = new FormData(e.currentTarget);
    const monthlyIncomeRaw = String(fd.get("monthlyIncome") ?? "").trim();
    const downPaymentRaw = String(fd.get("downPayment") ?? "").trim();
    const payload = {
      subdomain,
      firstName: String(fd.get("firstName") ?? "").trim(),
      lastName: String(fd.get("lastName") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      phone: String(fd.get("phone") ?? "").trim() || undefined,
      dob: String(fd.get("dob") ?? "").trim() || undefined,
      ssnLast4: String(fd.get("ssnLast4") ?? "").trim() || undefined,
      address: {
        line1: String(fd.get("addressLine1") ?? "").trim() || undefined,
        city: String(fd.get("city") ?? "").trim() || undefined,
        region: String(fd.get("region") ?? "").trim() || undefined,
        postal: String(fd.get("postal") ?? "").trim() || undefined,
      },
      employmentStatus: String(fd.get("employmentStatus") ?? "").trim() || undefined,
      monthlyIncome: monthlyIncomeRaw ? Number(monthlyIncomeRaw) : undefined,
      downPayment: downPaymentRaw ? Number(downPaymentRaw) : undefined,
      consentCreditCheck: fd.get("consentCreditCheck") === "on",
      vehicleStockNumber: vehicleStockNumber || undefined,
      vehicleId: vehicleId || undefined,
      sourceMeta: {
        page: pageName,
        referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
      },
    };

    try {
      const res = await fetch("/api/finance-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as {
        data?: { leadId?: string; customerId?: string };
        error?: { message?: string };
      };
      if (!res.ok || !body.data?.leadId) {
        setState({
          kind: "error",
          message: body.error?.message ?? "Could not submit your application.",
        });
        return;
      }
      setState({
        kind: "success",
        leadId: body.data.leadId,
        customerId: body.data.customerId ?? "",
      });
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
          Application received.
        </h3>
        <p className="mt-2 text-sm text-[color:var(--ink-muted)]">
          A finance specialist will follow up within one business day. Reference #
          {state.leadId.slice(-8)}.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4" aria-label="Finance application">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="fa-first">
            First name
          </label>
          <input id="fa-first" name="firstName" className="input" required minLength={1} maxLength={80} autoComplete="given-name" />
        </div>
        <div>
          <label className="label" htmlFor="fa-last">
            Last name
          </label>
          <input id="fa-last" name="lastName" className="input" required minLength={1} maxLength={80} autoComplete="family-name" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="fa-email">
            Email
          </label>
          <input id="fa-email" name="email" type="email" className="input" required autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="fa-phone">
            Phone
          </label>
          <input id="fa-phone" name="phone" type="tel" className="input" required autoComplete="tel" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="fa-dob">
            Date of birth
          </label>
          <input id="fa-dob" name="dob" type="date" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="fa-ssn">
            SSN — last 4 digits
          </label>
          <input
            id="fa-ssn"
            name="ssnLast4"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            className="input"
            autoComplete="off"
            aria-describedby="fa-ssn-help"
          />
          <p id="fa-ssn-help" className="mt-1 text-xs text-[color:var(--ink-muted)]">
            We only need the last 4 for a soft credit check. Encrypted in transit.
          </p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="fa-address1">
          Address
        </label>
        <input
          id="fa-address1"
          name="addressLine1"
          className="input"
          placeholder="123 Main St"
          autoComplete="address-line1"
        />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="fa-city">
            City
          </label>
          <input id="fa-city" name="city" className="input" autoComplete="address-level2" />
        </div>
        <div>
          <label className="label" htmlFor="fa-region">
            State / Province
          </label>
          <input id="fa-region" name="region" className="input" autoComplete="address-level1" />
        </div>
        <div>
          <label className="label" htmlFor="fa-postal">
            Postal code
          </label>
          <input id="fa-postal" name="postal" className="input" autoComplete="postal-code" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="fa-employment">
            Employment status
          </label>
          <select id="fa-employment" name="employmentStatus" className="input">
            <option value="">Prefer not to say</option>
            <option value="FULL_TIME">Full-time</option>
            <option value="PART_TIME">Part-time</option>
            <option value="SELF_EMPLOYED">Self-employed</option>
            <option value="UNEMPLOYED">Unemployed</option>
            <option value="RETIRED">Retired</option>
            <option value="STUDENT">Student</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="fa-income">
            Monthly income (USD)
          </label>
          <input
            id="fa-income"
            name="monthlyIncome"
            type="number"
            inputMode="numeric"
            min={0}
            className="input"
            placeholder="5000"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="fa-down">
          Down payment (USD, optional)
        </label>
        <input
          id="fa-down"
          name="downPayment"
          type="number"
          inputMode="numeric"
          min={0}
          className="input"
          placeholder="2000"
        />
      </div>

      <div className="flex items-start gap-2">
        <input
          id="fa-consent"
          name="consentCreditCheck"
          type="checkbox"
          className="mt-1"
        />
        <label htmlFor="fa-consent" className="text-sm text-[color:var(--ink-muted)]">
          I authorize {subdomain} to obtain my credit report for the purpose of evaluating
          this credit application.
        </label>
      </div>

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
        {state.kind === "submitting" ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}

"use client";

/**
 * SendForSignatureModal — "send for signature" picker.
 *
 * Two-step modal:
 *   1. Pick a template (bills of sale, F&I, credit app, warranty, trade)
 *   2. Fill in signers (one row per required role) and review
 *      merge fields (auto-hydrated from the deal, shown read-only)
 *
 * The form is intentionally minimal — merge fields are populated
 * server-side from the deal record. Operators only need to
 * provide signers' emails + names.
 *
 * Pre-fill:
 *   - For templates with a "Buyer" role, default the email/name
 *     from the deal's customer record (passed via `customer`).
 *   - For "Manager" / "Finance Manager" roles, default to the
 *     deal's assignedTo user (passed via `defaultManager`).
 *
 * Validation:
 *   - At least one signer with a non-empty email is required.
 *   - Required roles must be filled.
 *
 * On submit:
 *   - Calls `onSubmit(input)` with the typed payload. The parent
 *     owns the mutation (useCreateEnvelope).
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, FileSignature, Loader2, Plus, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import {
  useCreateEnvelope,
  useTemplates,
  type CreateEnvelopeInput,
  type SignerInput,
  type TemplateListItem,
} from "@/hooks/useSignatures";

export interface SendForSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  dealId: string;
  /** Optional defaults from the deal — used to pre-fill signers. */
  customer?: { name: string; email: string } | null;
  defaultManager?: { name: string; email: string } | null;
  /** Optional callback fired after a successful create. */
  onCreated?: (envelopeId: string) => void;
}

interface SignerRow {
  roleName: string;
  email: string;
  name: string;
  enabled: boolean;
}

function buildInitialSigners(
  template: TemplateListItem | null,
  customer: SendForSignatureModalProps["customer"],
  defaultManager: SendForSignatureModalProps["defaultManager"],
): SignerRow[] {
  if (!template) return [];
  return template.roles.map((role) => {
    const roleName = role.name.toLowerCase();
    let name = "";
    let email = "";
    if (roleName === "buyer" || roleName === "co-buyer") {
      name = customer?.name ?? "";
      email = customer?.email ?? "";
    } else if (roleName.includes("manager")) {
      name = defaultManager?.name ?? "";
      email = defaultManager?.email ?? "";
    }
    return {
      roleName: role.name,
      name,
      email,
      enabled: role.required || roleName === "co-buyer" ? true : roleName === "co-buyer" ? false : true,
    };
  });
}

export function SendForSignatureModal({
  isOpen,
  onClose,
  dealId,
  customer,
  defaultManager,
  onCreated,
}: SendForSignatureModalProps) {
  const { data: templates, isLoading: templatesLoading } = useTemplates();
  const create = useCreateEnvelope();
  const [step, setStep] = useState<"template" | "signers">("template");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [signers, setSigners] = useState<SignerRow[]>([]);
  const [sendNow, setSendNow] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedTemplate = useMemo<TemplateListItem | null>(
    () => templates?.find((t) => t.slug === selectedSlug) ?? null,
    [templates, selectedSlug],
  );

  // Reset state when the modal opens.
  useEffect(() => {
    if (isOpen) {
      setStep("template");
      setSelectedSlug(null);
      setSigners([]);
      setSendNow(true);
      setErrorMsg(null);
    }
  }, [isOpen]);

  // When a template is picked, build the initial signer rows.
  useEffect(() => {
    if (selectedTemplate) {
      setSigners(buildInitialSigners(selectedTemplate, customer, defaultManager));
    }
  }, [selectedTemplate, customer, defaultManager]);

  function pickTemplate(slug: string) {
    setSelectedSlug(slug);
    setStep("signers");
  }

  function updateSigner(idx: number, patch: Partial<SignerRow>) {
    setSigners((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function setSignerEnabled(idx: number, enabled: boolean) {
    setSigners((prev) => prev.map((s, i) => (i === idx ? { ...s, enabled } : s)));
  }

  function validateAndBuild(): CreateEnvelopeInput | null {
    setErrorMsg(null);
    if (!selectedTemplate) {
      setErrorMsg("Pick a template first.");
      return null;
    }
    const activeSigners = signers.filter((s) => s.enabled);
    if (activeSigners.length === 0) {
      setErrorMsg("At least one signer is required.");
      return null;
    }
    for (const s of activeSigners) {
      if (!s.email.trim()) {
        setErrorMsg(`Provide an email for the ${s.roleName}.`);
        return null;
      }
      if (!s.name.trim()) {
        setErrorMsg(`Provide a name for the ${s.roleName}.`);
        return null;
      }
    }
    // Required role check.
    for (const role of selectedTemplate.roles) {
      if (role.required) {
        const filled = activeSigners.some(
          (s) => s.roleName === role.name && s.email.trim().length > 0,
        );
        if (!filled) {
          setErrorMsg(`Role "${role.name}" is required.`);
          return null;
        }
      }
    }
    const signersOut: SignerInput[] = activeSigners.map((s) => ({
      roleName: s.roleName,
      email: s.email.trim(),
      name: s.name.trim(),
    }));
    return {
      templateSlug: selectedTemplate.slug,
      dealId,
      signers: signersOut,
      sendNow,
    };
  }

  async function handleSubmit() {
    const input = validateAndBuild();
    if (!input) return;
    try {
      const result = await create.mutateAsync(input);
      onCreated?.(result.id);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to send for signature");
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={step === "template" ? "Send for signature" : `Send: ${selectedTemplate?.displayName}`}
      description={
        step === "template"
          ? "Pick a document template to send to DocuSign."
          : "Fill in the signers. Merge fields are auto-populated from the deal."
      }
    >
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs text-text-muted mb-4">
        <button
          type="button"
          onClick={() => setStep("template")}
          className={cn(
            "inline-flex items-center gap-1 hover:text-text-primary transition-colors",
            step === "template" && "text-text-primary font-medium",
          )}
        >
          {step === "signers" && <ChevronLeft className="h-3 w-3" aria-hidden="true" />}
          1. Template
        </button>
        <span aria-hidden="true">·</span>
        <span className={cn(step === "signers" && "text-text-primary font-medium")}>
          2. Signers
        </span>
      </div>

      {step === "template" && (
        <div className="space-y-2">
          {templatesLoading && (
            <div className="flex items-center gap-2 text-sm text-text-muted py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading templates…
            </div>
          )}
          {templates && templates.length === 0 && (
            <div className="text-sm text-text-muted py-6 text-center">
              No templates configured. Set DOCUSIGN_TEMPLATE_* env vars to enable.
            </div>
          )}
          {templates?.map((t) => (
            <button
              key={t.slug}
              type="button"
              onClick={() => pickTemplate(t.slug)}
              className={cn(
                "w-full text-left flex items-start gap-3 p-3 rounded-lg border transition-colors",
                "border-border hover:border-accent hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              )}
              aria-label={`Select ${t.displayName}`}
            >
              <div className="h-9 w-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
                <FileSignature className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-text-primary">
                    {t.displayName}
                  </span>
                  {!t.configured && (
                    <span className="text-[10px] uppercase tracking-wide text-text-muted">
                      Not configured
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted mt-0.5">{t.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {t.roles.map((r) => (
                    <span
                      key={r.name}
                      className="text-[10px] uppercase tracking-wide text-text-muted bg-bg-elevated border border-border rounded px-1.5 py-0.5"
                    >
                      {r.name}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {step === "signers" && selectedTemplate && (
        <div className="space-y-3">
          {signers.map((signer, idx) => {
            const isOptional =
              selectedTemplate.roles.find((r) => r.name === signer.roleName)?.required === false;
            return (
              <div
                key={`${signer.roleName}-${idx}`}
                className={cn(
                  "rounded-lg border p-3 space-y-2",
                  signer.enabled
                    ? "border-border bg-bg-card"
                    : "border-border/40 bg-bg-card/40 opacity-60",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      {signer.roleName}
                    </span>
                    {!isOptional && (
                      <span className="text-[10px] uppercase tracking-wide text-danger">
                        required
                      </span>
                    )}
                    {isOptional && (
                      <span className="text-[10px] uppercase tracking-wide text-text-muted">
                        optional
                      </span>
                    )}
                  </div>
                  {isOptional && (
                    <button
                      type="button"
                      onClick={() => setSignerEnabled(idx, !signer.enabled)}
                      className="text-xs h-7 px-2.5 rounded-md bg-bg-elevated hover:border-accent hover:text-accent transition-colors"
                    >
                      {signer.enabled ? (
                        <span className="inline-flex items-center gap-1">
                          <X className="h-3 w-3" aria-hidden="true" /> Skip
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Plus className="h-3 w-3" aria-hidden="true" /> Add
                        </span>
                      )}
                    </button>
                  )}
                </div>
                {signer.enabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={signer.name}
                      onChange={(e) => updateSigner(idx, { name: e.target.value })}
                      placeholder="Full name"
                      className="h-9 rounded-md border border-border bg-bg-primary px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      aria-label={`${signer.roleName} name`}
                    />
                    <input
                      type="email"
                      value={signer.email}
                      onChange={(e) => updateSigner(idx, { email: e.target.value })}
                      placeholder="email@example.com"
                      className="h-9 rounded-md border border-border bg-bg-primary px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      aria-label={`${signer.roleName} email`}
                    />
                  </div>
                )}
              </div>
            );
          })}

          <div className="pt-2">
            <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={sendNow}
                onChange={(e) => setSendNow(e.target.checked)}
                className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
              />
              <span>Send immediately (uncheck to save as draft)</span>
            </label>
          </div>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="mt-3 text-sm text-danger bg-danger/10 border border-danger/20 rounded-md p-2"
        >
          {errorMsg}
        </div>
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-9 px-3 rounded-md text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
        {step === "signers" && selectedTemplate && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={create.isPending}
            className="h-9 px-4 rounded-md bg-accent text-bg-primary text-sm font-medium hover:bg-[#d4e639] active:scale-[0.98] transition-all inline-flex items-center gap-2 disabled:opacity-50"
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {sendNow ? "Send for signature" : "Save draft"}
          </button>
        )}
      </div>
    </Modal>
  );
}

"use client";

/**
 * Per-step form components for the Add Customer wizard.
 *
 * Two steps per spec:
 *  1. Personal info (name, email, phone, credit score, source)
 *  2. Contact + notes (address, tags, internal notes)
 */

import { useCallback, useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { WizardStepProps2 } from "@/components/common/Wizard";

/* ------------------------------------------------------------------ */
/* Form type                                                           */
/* ------------------------------------------------------------------ */

export interface CustomerFormData {
  /* Step 1 */
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  creditScore: number | "";
  source: string;

  /* Step 2 */
  street: string;
  city: string;
  state: string;
  zip: string;
  tags: string[];
  notes: string;
}

export const CUSTOMER_INITIAL: CustomerFormData = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  creditScore: "",
  source: "Website",
  street: "",
  city: "",
  state: "",
  zip: "",
  tags: [],
  notes: "",
};

/* ------------------------------------------------------------------ */
/* Step 1: Personal info                                               */
/* ------------------------------------------------------------------ */

const SOURCE_OPTIONS = [
  { value: "Website", label: "Website" },
  { value: "Walk-in", label: "Walk-in" },
  { value: "Referral", label: "Referral" },
  { value: "Phone", label: "Phone inquiry" },
  { value: "Facebook", label: "Facebook" },
  { value: "Google Ads", label: "Google Ads" },
  { value: "Other", label: "Other" },
];

export function CustomerStep1Personal({
  data,
  update,
  errors,
}: WizardStepProps2<CustomerFormData>) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="First name"
          name="firstName"
          value={data.firstName}
          onChange={(e) => update({ firstName: e.target.value })}
          error={errors.firstName}
          required
          autoFocus
        />
        <Input
          label="Last name"
          name="lastName"
          value={data.lastName}
          onChange={(e) => update({ lastName: e.target.value })}
          error={errors.lastName}
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Email"
          name="email"
          type="email"
          value={data.email}
          onChange={(e) => update({ email: e.target.value })}
          error={errors.email}
        />
        <Input
          label="Phone"
          name="phone"
          type="tel"
          value={data.phone}
          onChange={(e) => update({ phone: e.target.value })}
          error={errors.phone}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Credit score"
          name="creditScore"
          type="number"
          min={300}
          max={850}
          value={data.creditScore === "" ? "" : String(data.creditScore)}
          onChange={(e) =>
            update({
              creditScore:
                e.target.value === "" ? "" : Number(e.target.value),
            })
          }
          helperText="300–850. Used to compute the credit tier."
        />
        <Select
          label="Source"
          name="source"
          value={data.source}
          onChange={(v) => update({ source: v })}
          options={SOURCE_OPTIONS}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2: Contact + notes                                             */
/* ------------------------------------------------------------------ */

export function CustomerStep2Contact({
  data,
  update,
  errors,
}: WizardStepProps2<CustomerFormData>) {
  const [tagDraft, setTagDraft] = useState("");

  const addTag = useCallback(() => {
    const v = tagDraft.trim();
    if (!v || data.tags.includes(v)) {
      setTagDraft("");
      return;
    }
    update({ tags: [...data.tags, v] });
    setTagDraft("");
  }, [tagDraft, data.tags, update]);

  const removeTag = useCallback(
    (tag: string) => {
      update({ tags: data.tags.filter((t) => t !== tag) });
    },
    [data.tags, update]
  );

  const handleTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && tagDraft === "" && data.tags.length > 0) {
      // Pop the last tag on backspace when input is empty
      update({ tags: data.tags.slice(0, -1) });
    }
  };

  return (
    <div className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-text-primary">
          Address <span className="text-text-muted font-normal">(optional)</span>
        </legend>
        <Input
          label="Street"
          name="street"
          value={data.street}
          onChange={(e) => update({ street: e.target.value })}
          error={errors.street}
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="City"
            name="city"
            value={data.city}
            onChange={(e) => update({ city: e.target.value })}
          />
          <Input
            label="State / Province"
            name="state"
            value={data.state}
            onChange={(e) => update({ state: e.target.value.toUpperCase() })}
            placeholder="BC"
            maxLength={3}
          />
          <Input
            label="Postal / ZIP"
            name="zip"
            value={data.zip}
            onChange={(e) => update({ zip: e.target.value })}
            placeholder="V6E 1G1"
          />
        </div>
      </fieldset>

      <div>
        <label
          htmlFor="tag-input"
          className="block text-sm font-medium text-text-primary mb-1.5"
        >
          Tags
        </label>
        <Card className="p-2 flex flex-wrap items-center gap-1.5 min-h-[42px]">
          {data.tags.map((t) => (
            <Badge key={t} variant="info" className="gap-1 pr-1">
              <span>{t}</span>
              <button
                type="button"
                onClick={() => removeTag(t)}
                aria-label={`Remove ${t}`}
                className="ml-0.5 rounded-sm hover:bg-info/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-info"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <input
            id="tag-input"
            type="text"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={handleTagKey}
            onBlur={addTag}
            placeholder={data.tags.length === 0 ? "e.g. vip, cash-buyer, fleet" : ""}
            className={cn(
              "flex-1 min-w-[120px] bg-transparent px-1 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none"
            )}
            aria-label="Add tag"
          />
          {tagDraft && (
            <button
              type="button"
              onClick={addTag}
              className="h-7 px-2 rounded-md bg-bg-elevated text-text-primary text-xs flex items-center gap-1 hover:border-border-active"
              aria-label="Add tag"
            >
              <Plus className="h-3 w-3" />
              <span>Add</span>
            </button>
          )}
        </Card>
        <p className="text-xs text-text-muted mt-1.5">
          Press Enter or comma to add. Backspace removes the last tag.
        </p>
      </div>

      <div>
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-text-primary mb-1.5"
        >
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          value={data.notes}
          onChange={(e) => update({ notes: e.target.value })}
          rows={4}
          placeholder="Anything the team should know — preferences, vehicles of interest, follow-up cadence…"
          className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
        />
        {errors.notes && (
          <p className="mt-1 text-xs text-danger">{errors.notes}</p>
        )}
      </div>
    </div>
  );
}

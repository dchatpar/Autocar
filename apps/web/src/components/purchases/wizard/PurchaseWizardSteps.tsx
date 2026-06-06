"use client";

/**
 * Per-step form components for the Purchase from Public wizard.
 *
 * Each step is a pure presentational component that takes
 * `{ data, update, errors, isFirstStep, isLastStep }` and renders
 * the fields for that section.
 */

import { useCallback } from "react";
import { AlertCircle, Check } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";
import type {
  PurchaseCondition,
  PurchaseSource,
  SellerType,
} from "@dealeros/shared";

import type { WizardStepProps2 } from "@/components/common/Wizard";

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */

export interface PurchaseFormData {
  /* Step 1 — Vehicle info */
  vin: string;
  year: number | "";
  make: string;
  model: string;
  trim: string;
  odometer: number | "";
  exteriorColor: string;
  interiorColor: string;
  condition: PurchaseCondition;

  /* Step 2 — Purchase details */
  purchaseDate: string; // ISO yyyy-mm-dd
  purchasePrice: number | "";
  source: PurchaseSource;

  /* Step 3 — Seller */
  sellerType: SellerType;
  sellerName: string;
  sellerPhone: string;
  sellerEmail: string;
  sellerAddressStreet: string;
  sellerAddressCity: string;
  sellerAddressProvince: string;
  sellerAddressPostal: string;

  /* Step 4 — Documentation (mock — file list) */
  hasBillOfSale: boolean;
  hasOwnership: boolean;
  hasInsurance: boolean;
  hasInspection: boolean;
  documentNotes: string;

  /* Step 5 — Internal */
  acceptedById: string;
  notes: string;
  checklistInspection: boolean;
  checklistRecon: boolean;
  checklistPhotos: boolean;
  checklistListed: boolean;
}

export const PURCHASE_INITIAL: PurchaseFormData = {
  vin: "",
  year: "",
  make: "",
  model: "",
  trim: "",
  odometer: "",
  exteriorColor: "",
  interiorColor: "",
  condition: "GOOD",
  purchaseDate: new Date().toISOString().slice(0, 10),
  purchasePrice: "",
  source: "WALKIN",
  sellerType: "INDIVIDUAL",
  sellerName: "",
  sellerPhone: "",
  sellerEmail: "",
  sellerAddressStreet: "",
  sellerAddressCity: "",
  sellerAddressProvince: "",
  sellerAddressPostal: "",
  hasBillOfSale: false,
  hasOwnership: false,
  hasInsurance: false,
  hasInspection: false,
  documentNotes: "",
  acceptedById: "",
  notes: "",
  checklistInspection: false,
  checklistRecon: false,
  checklistPhotos: false,
  checklistListed: false,
};

/* ------------------------------------------------------------------ */
/* Step 1: Vehicle info                                                */
/* ------------------------------------------------------------------ */

const CONDITION_OPTIONS: Array<{ value: PurchaseCondition; label: string }> = [
  { value: "EXCELLENT", label: "Excellent — like new" },
  { value: "GOOD", label: "Good — minor wear" },
  { value: "FAIR", label: "Fair — visible wear" },
  { value: "POOR", label: "Poor — significant issues" },
  { value: "SALVAGE", label: "Salvage — rebuilt title" },
];

const CURRENT_YEAR = new Date().getFullYear();

export function PurchaseStep1Vehicle({
  data,
  update,
  errors,
}: WizardStepProps2<PurchaseFormData>) {
  const handleDecode = useCallback(() => {
    // In a real implementation, this calls the NHTSA VPIC endpoint.
    // We pre-fill a few common patterns so the demo is non-blocking.
    if (!data.vin || data.vin.length < 11) return;
    if (!data.make) update({ make: "Honda" });
    if (!data.model) update({ model: "Accord" });
    if (!data.year) update({ year: 2019 });
  }, [data, update]);

  return (
    <div className="space-y-5">
      <Card className="p-4 bg-bg-elevated/30">
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <Input
              label="VIN"
              name="vin"
              value={data.vin}
              onChange={(e) => update({ vin: e.target.value.toUpperCase() })}
              placeholder="1HGCM82633A123456"
              maxLength={17}
              error={errors.vin}
              helperText="17-character VIN — we&apos;ll auto-decode the basics."
              className="font-mono"
              required
            />
          </div>
          <button
            type="button"
            onClick={handleDecode}
            disabled={!data.vin || data.vin.length < 11}
            className="h-10 px-4 rounded-lg bg-accent text-bg-primary font-medium text-sm hover:bg-[#d4e639] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
          >
            Decode VIN
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Input
          label="Year"
          name="year"
          type="number"
          min={1900}
          max={CURRENT_YEAR + 1}
          value={data.year === "" ? "" : String(data.year)}
          onChange={(e) =>
            update({ year: e.target.value === "" ? "" : Number(e.target.value) })
          }
          error={errors.year}
          required
        />
        <Input
          label="Make"
          name="make"
          value={data.make}
          onChange={(e) => update({ make: e.target.value })}
          error={errors.make}
          required
        />
        <Input
          label="Model"
          name="model"
          value={data.model}
          onChange={(e) => update({ model: e.target.value })}
          error={errors.model}
          required
        />
        <Input
          label="Trim"
          name="trim"
          value={data.trim}
          onChange={(e) => update({ trim: e.target.value })}
          error={errors.trim}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Input
          label="Odometer (km)"
          name="odometer"
          type="number"
          min={0}
          value={data.odometer === "" ? "" : String(data.odometer)}
          onChange={(e) =>
            update({
              odometer: e.target.value === "" ? "" : Number(e.target.value),
            })
          }
          error={errors.odometer}
          required
        />
        <Input
          label="Exterior color"
          name="exteriorColor"
          value={data.exteriorColor}
          onChange={(e) => update({ exteriorColor: e.target.value })}
        />
        <Input
          label="Interior color"
          name="interiorColor"
          value={data.interiorColor}
          onChange={(e) => update({ interiorColor: e.target.value })}
        />
      </div>

      <Select
        label="Condition"
        name="condition"
        value={data.condition}
        onChange={(v) => update({ condition: v as PurchaseCondition })}
        options={CONDITION_OPTIONS}
        helperText="Honest condition keeps the re-pricing math honest."
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2: Purchase details                                            */
/* ------------------------------------------------------------------ */

const SOURCE_OPTIONS: Array<{ value: PurchaseSource; label: string }> = [
  { value: "WALKIN", label: "Walk-in" },
  { value: "PHONE", label: "Phone inquiry" },
  { value: "ONLINE", label: "Online listing" },
  { value: "AUCTION", label: "Auction" },
  { value: "TRADE_IN", label: "Trade-in" },
  { value: "OTHER", label: "Other" },
];

export function PurchaseStep2Details({
  data,
  update,
  errors,
}: WizardStepProps2<PurchaseFormData>) {
  const price = data.purchasePrice === "" ? 0 : data.purchasePrice;
  const reconEstimate = Math.round(price * 0.08);
  const targetAsking = Math.round(price * 1.18);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Purchase date"
          name="purchaseDate"
          type="date"
          value={data.purchaseDate}
          onChange={(e) => update({ purchaseDate: e.target.value })}
          error={errors.purchaseDate}
          required
        />
        <Input
          label="Purchase price (CAD)"
          name="purchasePrice"
          type="number"
          min={0}
          step={100}
          value={data.purchasePrice === "" ? "" : String(data.purchasePrice)}
          onChange={(e) =>
            update({
              purchasePrice:
                e.target.value === "" ? "" : Number(e.target.value),
            })
          }
          error={errors.purchasePrice}
          leftIcon={<span className="text-text-muted text-sm">$</span>}
          required
        />
      </div>

      <Select
        label="Source"
        name="source"
        value={data.source}
        onChange={(v) => update({ source: v as PurchaseSource })}
        options={SOURCE_OPTIONS}
        helperText="Where did this lead originate? Tracks marketing ROI."
      />

      {price > 0 && (
        <Card className="p-4 bg-info/5 border-info/20">
          <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-info" aria-hidden="true" />
            Quick math
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-text-muted">Acquisition cost</p>
              <p className="font-semibold text-text-primary tabular-nums">
                {formatCurrency(price)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Est. reconditioning</p>
              <p className="font-semibold text-text-primary tabular-nums">
                {formatCurrency(reconEstimate)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Target asking (~18% margin)</p>
              <p className="font-semibold text-accent tabular-nums">
                {formatCurrency(targetAsking)}
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 3: Seller                                                      */
/* ------------------------------------------------------------------ */

const SELLER_TYPE_OPTIONS: Array<{ value: SellerType; label: string }> = [
  { value: "INDIVIDUAL", label: "Individual" },
  { value: "COMPANY", label: "Company / Fleet" },
  { value: "DEALER", label: "Other dealer" },
  { value: "AUCTION", label: "Auction house" },
];

export function PurchaseStep3Seller({
  data,
  update,
  errors,
}: WizardStepProps2<PurchaseFormData>) {
  return (
    <div className="space-y-5">
      <Select
        label="Seller type"
        name="sellerType"
        value={data.sellerType}
        onChange={(v) => update({ sellerType: v as SellerType })}
        options={SELLER_TYPE_OPTIONS}
        required
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Seller name"
          name="sellerName"
          value={data.sellerName}
          onChange={(e) => update({ sellerName: e.target.value })}
          error={errors.sellerName}
          required
        />
        <Input
          label="Phone"
          name="sellerPhone"
          type="tel"
          value={data.sellerPhone}
          onChange={(e) => update({ sellerPhone: e.target.value })}
          error={errors.sellerPhone}
        />
        <Input
          label="Email"
          name="sellerEmail"
          type="email"
          value={data.sellerEmail}
          onChange={(e) => update({ sellerEmail: e.target.value })}
          error={errors.sellerEmail}
        />
      </div>

      <fieldset className="space-y-3 border-t border-border pt-4">
        <legend className="text-sm font-medium text-text-primary">
          Address <span className="text-text-muted font-normal">(optional)</span>
        </legend>
        <Input
          label="Street"
          name="sellerAddressStreet"
          value={data.sellerAddressStreet}
          onChange={(e) => update({ sellerAddressStreet: e.target.value })}
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="City"
            name="sellerAddressCity"
            value={data.sellerAddressCity}
            onChange={(e) => update({ sellerAddressCity: e.target.value })}
          />
          <Input
            label="Province"
            name="sellerAddressProvince"
            value={data.sellerAddressProvince}
            onChange={(e) => update({ sellerAddressProvince: e.target.value })}
            placeholder="BC"
            maxLength={2}
          />
          <Input
            label="Postal code"
            name="sellerAddressPostal"
            value={data.sellerAddressPostal}
            onChange={(e) => update({ sellerAddressPostal: e.target.value })}
            placeholder="V6E 1G1"
          />
        </div>
      </fieldset>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 4: Documentation                                               */
/* ------------------------------------------------------------------ */

interface DocItem {
  key: "hasBillOfSale" | "hasOwnership" | "hasInsurance" | "hasInspection";
  label: string;
  description: string;
}

const DOCUMENTS: DocItem[] = [
  { key: "hasBillOfSale", label: "Bill of sale", description: "Signed agreement transferring ownership" },
  { key: "hasOwnership", label: "Ownership / Title", description: "Vehicle registration signed over" },
  { key: "hasInsurance", label: "Insurance proof", description: "Valid coverage at time of sale" },
  { key: "hasInspection", label: "Mechanical inspection", description: "Independent third-party report" },
];

export function PurchaseStep4Docs({
  data,
  update,
  errors,
}: WizardStepProps2<PurchaseFormData>) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {DOCUMENTS.map((d) => {
          const checked = data[d.key];
          return (
            <label
              key={d.key}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                checked
                  ? "border-success/30 bg-success/5"
                  : "border-border bg-bg-elevated/30 hover:border-border-active"
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => update({ [d.key]: e.target.checked } as Partial<PurchaseFormData>)}
                className="mt-1 h-4 w-4 rounded border-border bg-bg-elevated text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
                aria-describedby={`${d.key}-desc`}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text-primary">
                    {d.label}
                  </p>
                  {checked && (
                    <Check
                      className="h-3.5 w-3.5 text-success"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <p id={`${d.key}-desc`} className="text-xs text-text-muted">
                  {d.description}
                </p>
              </div>
            </label>
          );
        })}
      </div>

      <div>
        <label
          htmlFor="documentNotes"
          className="block text-sm font-medium text-text-primary mb-1.5"
        >
          Document notes
        </label>
        <textarea
          id="documentNotes"
          name="documentNotes"
          value={data.documentNotes}
          onChange={(e) => update({ documentNotes: e.target.value })}
          rows={3}
          placeholder="Any missing docs, follow-ups, etc."
          className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
        />
        {errors.documentNotes && (
          <p className="mt-1 text-xs text-danger">{errors.documentNotes}</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 5: Review + Internal                                           */
/* ------------------------------------------------------------------ */

export function PurchaseStep5Review({
  data,
  update,
}: WizardStepProps2<PurchaseFormData>) {
  const checklist = [
    { key: "checklistInspection", label: "Mechanical inspection complete" },
    { key: "checklistRecon", label: "Reconditioning estimate filed" },
    { key: "checklistPhotos", label: "Inventory photos taken" },
    { key: "checklistListed", label: "Listed on dealer website" },
  ] as const;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Summary</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Pair label="Vehicle">
            {data.year} {data.make} {data.model}
            {data.trim ? ` ${data.trim}` : ""}
          </Pair>
          <Pair label="VIN" mono>
            {data.vin || "—"}
          </Pair>
          <Pair label="Odometer">
            {data.odometer === "" ? "—" : `${data.odometer.toLocaleString()} km`}
          </Pair>
          <Pair label="Condition">{data.condition}</Pair>
          <Pair label="Purchase price">
            {data.purchasePrice === ""
              ? "—"
              : formatCurrency(Number(data.purchasePrice))}
          </Pair>
          <Pair label="Source">{data.source}</Pair>
          <Pair label="Seller">
            {data.sellerName || "—"} · {data.sellerType}
          </Pair>
          <Pair label="Phone">{data.sellerPhone || "—"}</Pair>
        </dl>
      </Card>

      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">
          Internal checklist
        </h3>
        <div className="space-y-2">
          {checklist.map((c) => {
            const checked = data[c.key];
            return (
              <label
                key={c.key}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer",
                  checked
                    ? "border-accent/30 bg-accent/5"
                    : "border-border bg-bg-elevated/30"
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    update({ [c.key]: e.target.checked } as Partial<PurchaseFormData>)
                  }
                  className="h-4 w-4 rounded border-border bg-bg-elevated text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
                />
                <span className="text-sm text-text-primary">{c.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-text-primary mb-1.5"
        >
          Internal notes
        </label>
        <textarea
          id="notes"
          name="notes"
          value={data.notes}
          onChange={(e) => update({ notes: e.target.value })}
          rows={3}
          placeholder="Anything else the team should know…"
          className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
        />
      </div>
    </div>
  );
}

function Pair({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd
        className={cn(
          "text-text-primary mt-0.5",
          mono && "font-mono text-sm"
        )}
      >
        {children}
      </dd>
    </div>
  );
}

"use client";

/**
 * Per-step form components for the Add Vehicle wizard.
 *
 * Five steps per spec:
 *  1. Basic info (VIN, year, make, model, trim, stock #)
 *  2. Specs (body, fuel, transmission, drivetrain, engine, mileage, color)
 *  3. Pricing (cost, asking, internet, market, floor)
 *  4. Images (URLs of photos — uploader stub)
 *  5. Review (sanity check + submit)
 */

import { useCallback, useState } from "react";
import { Image as ImageIcon, Plus, RefreshCw, Trash2, Upload, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDecodeVin } from "@/hooks/useInventory";
import { cn, formatCurrency } from "@/lib/utils";
import type { BodyStyle, FuelType } from "@/types/api";

import type { WizardStepProps2 } from "@/components/common/Wizard";

/* ------------------------------------------------------------------ */
/* Shared form type                                                    */
/* ------------------------------------------------------------------ */

export interface VehicleFormData {
  /* Step 1 — Basic */
  vin: string;
  stockNumber: string;
  year: number | "";
  make: string;
  model: string;
  trim: string;

  /* Step 2 — Specs */
  bodyStyle: BodyStyle | "";
  fuelType: FuelType | "";
  transmission: "Automatic" | "Manual" | "";
  drivetrain: "FWD" | "RWD" | "AWD" | "4WD" | "";
  engine: string;
  mileage: number | "";
  exteriorColor: string;
  interiorColor: string;

  /* Step 3 — Pricing */
  cost: number | "";
  askingPrice: number | "";
  internetPrice: number | "";
  marketValue: number | "";
  floorPlan: number | "";

  /* Step 4 — Images */
  photoUrls: string[];

  /* Step 5 — Review */
  notes: string;
}

export const VEHICLE_INITIAL: VehicleFormData = {
  vin: "",
  stockNumber: "",
  year: "",
  make: "",
  model: "",
  trim: "",
  bodyStyle: "",
  fuelType: "",
  transmission: "",
  drivetrain: "",
  engine: "",
  mileage: "",
  exteriorColor: "",
  interiorColor: "",
  cost: "",
  askingPrice: "",
  internetPrice: "",
  marketValue: "",
  floorPlan: "",
  photoUrls: [],
  notes: "",
};

/* ------------------------------------------------------------------ */
/* Step 1: Basic info                                                  */
/* ------------------------------------------------------------------ */

const CURRENT_YEAR = new Date().getFullYear();

export function VehicleStep1Basic({
  data,
  update,
  errors,
}: WizardStepProps2<VehicleFormData>) {
  const decoded = useDecodeVin(data.vin.length >= 11 ? data.vin : null);

  const applyDecoded = useCallback(() => {
    if (!decoded.data) return;
    const d = decoded.data;
    const patch: Partial<VehicleFormData> = {};
    if (d.make) patch.make = d.make;
    if (d.model) patch.model = d.model;
    if (d.year) patch.year = d.year;
    if (d.trim) patch.trim = d.trim;
    if (d.bodyStyle) patch.bodyStyle = d.bodyStyle;
    if (d.fuelType) patch.fuelType = d.fuelType;
    if (d.transmission) patch.transmission = d.transmission as VehicleFormData["transmission"];
    update(patch);
  }, [decoded.data, update]);

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
          <Button
            type="button"
            variant="secondary"
            onClick={applyDecoded}
            disabled={!decoded.data}
            isLoading={decoded.isFetching}
            aria-label="Apply decoded values"
          >
            {decoded.isFetching ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Decoding…</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Apply decoded</span>
              </>
            )}
          </Button>
        </div>
        {decoded.data && (
          <p className="text-xs text-success mt-2 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
            Decoded: {decoded.data.make} {decoded.data.model} ({decoded.data.year})
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
        />
        <Input
          label="Stock #"
          name="stockNumber"
          value={data.stockNumber}
          onChange={(e) => update({ stockNumber: e.target.value.toUpperCase() })}
          placeholder="Auto-generated if empty"
          helperText="Dealer-prefixed stock number."
        />
        <Input
          label="Mileage (km)"
          name="mileage"
          type="number"
          min={0}
          value={data.mileage === "" ? "" : String(data.mileage)}
          onChange={(e) =>
            update({
              mileage: e.target.value === "" ? "" : Number(e.target.value),
            })
          }
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2: Specs                                                       */
/* ------------------------------------------------------------------ */

const BODY_OPTIONS: Array<{ value: BodyStyle; label: string }> = [
  { value: "Sedan", label: "Sedan" },
  { value: "SUV", label: "SUV" },
  { value: "Truck", label: "Truck" },
  { value: "Coupe", label: "Coupe" },
  { value: "Wagon", label: "Wagon" },
  { value: "Van", label: "Van" },
];

const FUEL_OPTIONS: Array<{ value: FuelType; label: string }> = [
  { value: "Gas", label: "Gasoline" },
  { value: "Hybrid", label: "Hybrid" },
  { value: "Electric", label: "Electric" },
  { value: "Diesel", label: "Diesel" },
];

const TRANS_OPTIONS = [
  { value: "Automatic", label: "Automatic" },
  { value: "Manual", label: "Manual" },
];

const DRIVETRAIN_OPTIONS = [
  { value: "FWD", label: "FWD" },
  { value: "RWD", label: "RWD" },
  { value: "AWD", label: "AWD" },
  { value: "4WD", label: "4WD" },
];

export function VehicleStep2Specs({
  data,
  update,
}: WizardStepProps2<VehicleFormData>) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Select
          label="Body style"
          name="bodyStyle"
          value={data.bodyStyle}
          onChange={(v) => update({ bodyStyle: v as BodyStyle })}
          options={[{ value: "", label: "Select…" }, ...BODY_OPTIONS]}
        />
        <Select
          label="Fuel type"
          name="fuelType"
          value={data.fuelType}
          onChange={(v) => update({ fuelType: v as FuelType })}
          options={[{ value: "", label: "Select…" }, ...FUEL_OPTIONS]}
        />
        <Select
          label="Transmission"
          name="transmission"
          value={data.transmission}
          onChange={(v) => update({ transmission: v as VehicleFormData["transmission"] })}
          options={[{ value: "", label: "Select…" }, ...TRANS_OPTIONS]}
        />
        <Select
          label="Drivetrain"
          name="drivetrain"
          value={data.drivetrain}
          onChange={(v) => update({ drivetrain: v as VehicleFormData["drivetrain"] })}
          options={[{ value: "", label: "Select…" }, ...DRIVETRAIN_OPTIONS]}
        />
        <Input
          label="Engine"
          name="engine"
          value={data.engine}
          onChange={(e) => update({ engine: e.target.value })}
          placeholder="e.g. 3.5L V6"
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 3: Pricing                                                     */
/* ------------------------------------------------------------------ */

function PriceField({
  label,
  name,
  value,
  onChange,
  error,
  helperText,
}: {
  label: string;
  name: string;
  value: number | "";
  onChange: (n: number | "") => void;
  error?: string;
  helperText?: string;
}) {
  return (
    <Input
      label={label}
      name={name}
      type="number"
      min={0}
      step={100}
      value={value === "" ? "" : String(value)}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      error={error}
      helperText={helperText}
      leftIcon={<span className="text-text-muted text-sm">$</span>}
    />
  );
}

export function VehicleStep3Pricing({
  data,
  update,
}: WizardStepProps2<VehicleFormData>) {
  const cost = data.cost === "" ? 0 : data.cost;
  const asking = data.askingPrice === "" ? 0 : data.askingPrice;
  const internet = data.internetPrice === "" ? 0 : data.internetPrice;
  const margin =
    cost > 0 && asking > 0 ? Math.round(((asking - cost) / cost) * 100) : 0;
  const marginColor =
    margin < 8
      ? "text-danger"
      : margin < 15
        ? "text-warning"
        : "text-success";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <PriceField
          label="Cost (what you paid)"
          name="cost"
          value={data.cost}
          onChange={(v) => update({ cost: v })}
        />
        <PriceField
          label="Asking price"
          name="askingPrice"
          value={data.askingPrice}
          onChange={(v) => update({ askingPrice: v })}
          helperText="Window sticker / list price"
        />
        <PriceField
          label="Internet price"
          name="internetPrice"
          value={data.internetPrice}
          onChange={(v) => update({ internetPrice: v })}
          helperText="Shown on the website"
        />
        <PriceField
          label="Market value"
          name="marketValue"
          value={data.marketValue}
          onChange={(v) => update({ marketValue: v })}
        />
        <PriceField
          label="Floor plan"
          name="floorPlan"
          value={data.floorPlan}
          onChange={(v) => update({ floorPlan: v })}
          helperText="Lender&apos;s max advance"
        />
      </div>

      {cost > 0 && asking > 0 && (
        <Card className="p-4 bg-info/5 border-info/20">
          <h3 className="text-sm font-semibold text-text-primary mb-2">
            Pricing health
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-text-muted">Gross margin</p>
              <p className={cn("text-xl font-bold tabular-nums", marginColor)}>
                {margin}%
              </p>
              <p className="text-xs text-text-muted">
                {margin < 8
                  ? "Below safe floor"
                  : margin < 15
                    ? "Healthy"
                    : "Aggressive"}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Expected gross</p>
              <p className="text-xl font-bold text-text-primary tabular-nums">
                {formatCurrency(asking - cost)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Online vs asking</p>
              <p className="text-xl font-bold text-text-primary tabular-nums">
                {asking > 0 && internet > 0
                  ? formatCurrency(asking - internet)
                  : "—"}
              </p>
              <p className="text-xs text-text-muted">
                {asking > 0 && internet > 0 && internet < asking
                  ? "Discount"
                  : "—"}
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 4: Images                                                      */
/* ------------------------------------------------------------------ */

export function VehicleStep4Images({
  data,
  update,
}: WizardStepProps2<VehicleFormData>) {
  const [draft, setDraft] = useState("");

  const addPhoto = useCallback(() => {
    const url = draft.trim();
    if (!url) return;
    update({ photoUrls: [...data.photoUrls, url] });
    setDraft("");
  }, [draft, data.photoUrls, update]);

  const removePhoto = useCallback(
    (index: number) => {
      update({ photoUrls: data.photoUrls.filter((_, i) => i !== index) });
    },
    [data.photoUrls, update]
  );

  return (
    <div className="space-y-5">
      <Card className="p-4 bg-bg-elevated/30">
        <label
          htmlFor="photo-url"
          className="block text-sm font-medium text-text-primary mb-1.5"
        >
          Add photo URL
        </label>
        <div className="flex gap-2">
          <input
            id="photo-url"
            type="url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPhoto())}
            placeholder="https://cdn.example.com/photo.jpg"
            className="flex-1 h-10 rounded-lg border border-border bg-bg-elevated px-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
          />
          <Button type="button" onClick={addPhoto} disabled={!draft.trim()}>
            <Plus className="h-4 w-4" />
            <span>Add</span>
          </Button>
        </div>
        <p className="text-xs text-text-muted mt-2 flex items-center gap-1">
          <Upload className="h-3 w-3" aria-hidden="true" />
          Direct upload coming in Phase 2 — paste CDN URLs for now.
        </p>
      </Card>

      {data.photoUrls.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <ImageIcon className="h-8 w-8 text-text-muted mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm text-text-muted">No photos yet</p>
          <p className="text-xs text-text-muted mt-1">
            Add at least 8 photos for best syndication results.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.photoUrls.map((url, index) => (
            <div
              key={`${url}-${index}`}
              className="group relative aspect-[4/3] rounded-lg border border-border overflow-hidden bg-bg-elevated"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Vehicle photo ${index + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
                }}
              />
              {index === 0 && (
                <Badge
                  variant="accent"
                  className="absolute top-2 left-2"
                >
                  Primary
                </Badge>
              )}
              <button
                type="button"
                onClick={() => removePhoto(index)}
                aria-label={`Remove photo ${index + 1}`}
                className="absolute top-2 right-2 h-7 w-7 rounded-full bg-bg-primary/80 backdrop-blur text-text-primary opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex items-center justify-center hover:bg-danger hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {data.photoUrls.length > 0 && (
        <p className="text-xs text-text-muted" aria-live="polite">
          {data.photoUrls.length} photo{data.photoUrls.length === 1 ? "" : "s"} — first photo is the primary.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 5: Review                                                      */
/* ------------------------------------------------------------------ */

export function VehicleStep5Review({
  data,
  update,
}: WizardStepProps2<VehicleFormData>) {
  const cost = data.cost === "" ? 0 : data.cost;
  const asking = data.askingPrice === "" ? 0 : data.askingPrice;
  const margin =
    cost > 0 && asking > 0 ? Math.round(((asking - cost) / cost) * 100) : 0;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Vehicle</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Pair label="VIN" mono>
            {data.vin || "—"}
          </Pair>
          <Pair label="Stock #">{data.stockNumber || "—"}</Pair>
          <Pair label="Year / Make / Model">
            {data.year || "—"} {data.make} {data.model}
            {data.trim ? ` ${data.trim}` : ""}
          </Pair>
          <Pair label="Body / Fuel / Trans">
            {[data.bodyStyle, data.fuelType, data.transmission].filter(Boolean).join(" · ") || "—"}
          </Pair>
          <Pair label="Mileage">
            {data.mileage === "" ? "—" : `${data.mileage.toLocaleString()} km`}
          </Pair>
          <Pair label="Color">
            {[data.exteriorColor, data.interiorColor].filter(Boolean).join(" / ") || "—"}
          </Pair>
        </dl>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Pricing</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <Pair label="Cost">{cost > 0 ? formatCurrency(cost) : "—"}</Pair>
          <Pair label="Asking">{asking > 0 ? formatCurrency(asking) : "—"}</Pair>
          <Pair label="Margin">
            {margin > 0 ? (
              <span
                className={cn(
                  "font-semibold",
                  margin < 8
                    ? "text-danger"
                    : margin < 15
                      ? "text-warning"
                      : "text-success"
                )}
              >
                {margin}%
              </span>
            ) : (
              "—"
            )}
          </Pair>
        </dl>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Media</h3>
        <div className="flex items-center gap-3">
          <ImageIcon className="h-4 w-4 text-text-muted" aria-hidden="true" />
          <p className="text-sm text-text-primary">
            {data.photoUrls.length} photo{data.photoUrls.length === 1 ? "" : "s"} attached
          </p>
        </div>
      </Card>

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
          placeholder="Anything else the team should know about this unit…"
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

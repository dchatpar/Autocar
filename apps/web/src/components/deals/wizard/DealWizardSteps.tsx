"use client";

/**
 * Per-step form components for the Create Deal wizard.
 *
 * Five steps per spec:
 *  1. Basic info (customer, vehicle, lead, deal type)
 *  2. Pricing (sale price, trade, taxes, fees)
 *  3. Payment (down, financed amount, rate, term, payment)
 *  4. Add-ons (warranty, gap, credit insurance, tire/wheel, rust)
 *  5. Review (summary + submit)
 */

import { useCallback, useMemo, useState } from "react";
import { AlertCircle, Car, Plus, Shield, Trash2, User } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCustomers } from "@/hooks/useCustomers";
import { useInventory } from "@/hooks/useInventory";
import { cn, formatCurrency } from "@/lib/utils";
import { USERS } from "@/lib/mock-data";

import type { WizardStepProps2 } from "@/components/common/Wizard";

/* ------------------------------------------------------------------ */
/* Form type                                                           */
/* ------------------------------------------------------------------ */

export interface AddOn {
  id: string;
  productType: "warranty" | "gap" | "credit_insurance" | "tire_wheel" | "rust";
  provider: string;
  cost: number | "";
  sellingPrice: number | "";
  termMonths: number | "";
  deductible: number | "";
}

export interface DealFormData {
  /* Step 1 — Basic */
  customerId: string;
  customerName: string;
  vehicleId: string;
  vehicleLabel: string;
  leadId: string;
  dealType: "retail" | "lease" | "bhph" | "wholesale" | "cash";
  assignedToId: string;

  /* Step 2 — Pricing */
  salePrice: number | "";
  tradeValue: number | "";
  tradePayoff: number | "";
  taxRate: number | ""; // %
  feeDoc: number | "";
  feeLicense: number | "";
  feeOther: number | "";

  /* Step 3 — Payment */
  downPayment: number | "";
  financedAmount: number | ""; // computed
  rate: number | ""; // %
  termMonths: number | "";
  paymentAmount: number | ""; // computed
  lender: string;

  /* Step 4 — Add-ons */
  addOns: AddOn[];

  /* Step 5 — Review */
  notes: string;
}

export const DEAL_INITIAL: DealFormData = {
  customerId: "",
  customerName: "",
  vehicleId: "",
  vehicleLabel: "",
  leadId: "",
  dealType: "retail",
  assignedToId: "",
  salePrice: "",
  tradeValue: "",
  tradePayoff: "",
  taxRate: 12,
  feeDoc: 499,
  feeLicense: 0,
  feeOther: 0,
  downPayment: "",
  financedAmount: "",
  rate: 7.99,
  termMonths: 60,
  paymentAmount: "",
  lender: "",
  addOns: [],
  notes: "",
};

/* ------------------------------------------------------------------ */
/* Step 1: Basic info                                                  */
/* ------------------------------------------------------------------ */

const DEAL_TYPE_OPTIONS = [
  { value: "retail", label: "Retail finance" },
  { value: "lease", label: "Lease" },
  { value: "bhph", label: "Buy-here-pay-here" },
  { value: "wholesale", label: "Wholesale" },
  { value: "cash", label: "Cash deal" },
];

const SALES_REPS = USERS.filter((u) => u.role === "salesperson" || u.role === "manager" || u.role === "owner");

export function DealStep1Basic({
  data,
  update,
  errors,
}: WizardStepProps2<DealFormData>) {
  const { data: customers } = useCustomers();
  const { data: vehicles } = useInventory({ status: "available" });

  const selectCustomer = useCallback(
    (id: string) => {
      const c = customers?.find((x) => x.id === id);
      update({ customerId: id, customerName: c?.name ?? "" });
    },
    [customers, update]
  );

  const selectVehicle = useCallback(
    (id: string) => {
      const v = vehicles?.find((x) => x.id === id);
      update({
        vehicleId: id,
        vehicleLabel: v ? `${v.year} ${v.make} ${v.model} ${v.trim}` : "",
      });
    },
    [vehicles, update]
  );

  return (
    <div className="space-y-5">
      <div>
        <label
          htmlFor="deal-customer"
          className="block text-sm font-medium text-text-primary mb-1.5"
        >
          Customer
        </label>
        <Select
          name="deal-customer"
          value={data.customerId}
          onChange={selectCustomer}
          options={[
            { value: "", label: "Select a customer…" },
            ...(customers?.map((c) => ({ value: c.id, label: `${c.name} · ${c.phone}` })) ?? []),
          ]}
        />
        {errors.customerId && (
          <p className="mt-1 text-xs text-danger">{errors.customerId}</p>
        )}
        {data.customerName && (
          <Card className="mt-2 p-3 flex items-center gap-3 bg-info/5 border-info/20">
            <div
              className="h-8 w-8 rounded-full bg-info/20 text-info flex items-center justify-center"
              aria-hidden="true"
            >
              <User className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">{data.customerName}</p>
            </div>
          </Card>
        )}
      </div>

      <div>
        <label
          htmlFor="deal-vehicle"
          className="block text-sm font-medium text-text-primary mb-1.5"
        >
          Vehicle
        </label>
        <Select
          name="deal-vehicle"
          value={data.vehicleId}
          onChange={selectVehicle}
          options={[
            { value: "", label: "Select a vehicle…" },
            ...(vehicles
              ?.filter((v) => v.status === "available")
              .map((v) => ({
                value: v.id,
                label: `${v.year} ${v.make} ${v.model} ${v.trim} · ${formatCurrency(v.price)}`,
              })) ?? []),
          ]}
        />
        {errors.vehicleId && (
          <p className="mt-1 text-xs text-danger">{errors.vehicleId}</p>
        )}
        {data.vehicleLabel && (
          <Card className="mt-2 p-3 flex items-center gap-3 bg-accent/5 border-accent/20">
            <div
              className="h-8 w-8 rounded-full bg-accent/20 text-accent flex items-center justify-center"
              aria-hidden="true"
            >
              <Car className="h-4 w-4" />
            </div>
            <p className="text-sm font-medium text-text-primary">{data.vehicleLabel}</p>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Deal type"
          name="dealType"
          value={data.dealType}
          onChange={(v) => update({ dealType: v as DealFormData["dealType"] })}
          options={DEAL_TYPE_OPTIONS}
          required
        />
        <Select
          label="Sales rep"
          name="assignedToId"
          value={data.assignedToId}
          onChange={(v) => update({ assignedToId: v })}
          options={[
            { value: "", label: "Select a rep…" },
            ...SALES_REPS.map((r) => ({ value: r.id, label: r.name })),
          ]}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2: Pricing                                                     */
/* ------------------------------------------------------------------ */

function MoneyInput({
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
  onChange: (v: number | "") => void;
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

export function DealStep2Pricing({
  data,
  update,
}: WizardStepProps2<DealFormData>) {
  const sale = data.salePrice === "" ? 0 : data.salePrice;
  const trade = data.tradeValue === "" ? 0 : data.tradeValue;
  const payoff = data.tradePayoff === "" ? 0 : data.tradePayoff;
  const taxRate = data.taxRate === "" ? 0 : data.taxRate;
  const feeDoc = data.feeDoc === "" ? 0 : data.feeDoc;
  const feeLicense = data.feeLicense === "" ? 0 : data.feeLicense;
  const feeOther = data.feeOther === "" ? 0 : data.feeOther;

  const taxableBase = Math.max(sale - trade, 0);
  const taxAmount = Math.round(taxableBase * (taxRate / 100) * 100) / 100;
  const totalFees = feeDoc + feeLicense + feeOther;
  const equity = trade - payoff;
  const totalDue = sale - trade + taxAmount + totalFees;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MoneyInput
          label="Sale price"
          name="salePrice"
          value={data.salePrice}
          onChange={(v) => update({ salePrice: v })}
        />
        <MoneyInput
          label="Trade-in value"
          name="tradeValue"
          value={data.tradeValue}
          onChange={(v) => update({ tradeValue: v })}
          helperText="What the customer&apos;s trade is worth"
        />
        <MoneyInput
          label="Trade payoff"
          name="tradePayoff"
          value={data.tradePayoff}
          onChange={(v) => update({ tradePayoff: v })}
          helperText="Remaining loan on the trade"
        />
        <Input
          label="Tax rate"
          name="taxRate"
          type="number"
          min={0}
          max={25}
          step={0.5}
          value={data.taxRate === "" ? "" : String(data.taxRate)}
          onChange={(e) =>
            update({ taxRate: e.target.value === "" ? "" : Number(e.target.value) })
          }
          rightIcon={<span className="text-text-muted text-sm">%</span>}
        />
      </div>

      <fieldset className="space-y-3 border-t border-border pt-4">
        <legend className="text-sm font-medium text-text-primary">Fees</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MoneyInput
            label="Doc fee"
            name="feeDoc"
            value={data.feeDoc}
            onChange={(v) => update({ feeDoc: v })}
          />
          <MoneyInput
            label="License"
            name="feeLicense"
            value={data.feeLicense}
            onChange={(v) => update({ feeLicense: v })}
          />
          <MoneyInput
            label="Other"
            name="feeOther"
            value={data.feeOther}
            onChange={(v) => update({ feeOther: v })}
          />
        </div>
      </fieldset>

      <Card className="p-4 bg-info/5 border-info/20">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Pricing summary</h3>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Pair label="Sale price">{formatCurrency(sale)}</Pair>
          <Pair label="Taxable base">{formatCurrency(taxableBase)}</Pair>
          <Pair label="Tax ({taxRate}%)">{formatCurrency(taxAmount)}</Pair>
          <Pair label="Total fees">{formatCurrency(totalFees)}</Pair>
          <Pair label="Trade equity">
            <span className={cn(equity < 0 && "text-danger")}>
              {formatCurrency(equity)}
            </span>
          </Pair>
          <Pair label="Total due" bold>
            {formatCurrency(totalDue)}
          </Pair>
        </dl>
        {payoff > 0 && equity < 0 && (
          <p className="text-xs text-danger mt-2 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            Trade payoff exceeds trade value — customer is upside down by {formatCurrency(-equity)}.
          </p>
        )}
      </Card>
    </div>
  );
}

function Pair({
  label,
  children,
  bold = false,
}: {
  label: string;
  children: React.ReactNode;
  bold?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd
        className={cn(
          "text-text-primary mt-0.5 tabular-nums",
          bold && "font-semibold text-base"
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 3: Payment                                                     */
/* ------------------------------------------------------------------ */

const TERM_OPTIONS = [
  { value: "12", label: "12 months" },
  { value: "24", label: "24 months" },
  { value: "36", label: "36 months" },
  { value: "48", label: "48 months" },
  { value: "60", label: "60 months" },
  { value: "72", label: "72 months" },
  { value: "84", label: "84 months" },
];

export function DealStep3Payment({
  data,
  update,
}: WizardStepProps2<DealFormData>) {
  const sale = data.salePrice === "" ? 0 : data.salePrice;
  const trade = data.tradeValue === "" ? 0 : data.tradeValue;
  const payoff = data.tradePayoff === "" ? 0 : data.tradePayoff;
  const taxRate = data.taxRate === "" ? 0 : data.taxRate;
  const feeDoc = data.feeDoc === "" ? 0 : data.feeDoc;
  const feeLicense = data.feeLicense === "" ? 0 : data.feeLicense;
  const feeOther = data.feeOther === "" ? 0 : data.feeOther;
  const down = data.downPayment === "" ? 0 : data.downPayment;
  const rate = data.rate === "" ? 0 : data.rate;
  const term = data.termMonths === "" ? 60 : data.termMonths;

  const taxableBase = Math.max(sale - trade, 0);
  const taxAmount = Math.round(taxableBase * (taxRate / 100) * 100) / 100;
  const totalFees = feeDoc + feeLicense + feeOther;
  const totalDue = Math.max(sale - trade + taxAmount + totalFees, 0);
  const financed = Math.max(totalDue - down, 0);
  const monthly = useMemo(() => {
    if (financed <= 0 || term <= 0) return 0;
    const r = rate / 100 / 12;
    if (r === 0) return financed / term;
    return (financed * r) / (1 - Math.pow(1 + r, -term));
  }, [financed, rate, term]);

  const handleAutoFill = useCallback(() => {
    update({
      financedAmount: Math.round(financed * 100) / 100,
      paymentAmount: Math.round(monthly * 100) / 100,
    });
  }, [financed, monthly, update]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MoneyInput
          label="Down payment"
          name="downPayment"
          value={data.downPayment}
          onChange={(v) => update({ downPayment: v })}
          helperText="Cash + trade equity"
        />
        <Input
          label="APR"
          name="rate"
          type="number"
          min={0}
          max={30}
          step={0.01}
          value={data.rate === "" ? "" : String(data.rate)}
          onChange={(e) =>
            update({ rate: e.target.value === "" ? "" : Number(e.target.value) })
          }
          rightIcon={<span className="text-text-muted text-sm">%</span>}
        />
        <Select
          label="Term"
          name="termMonths"
          value={String(term)}
          onChange={(v) => update({ termMonths: Number(v) as DealFormData["termMonths"] })}
          options={TERM_OPTIONS}
        />
        <Input
          label="Lender"
          name="lender"
          value={data.lender}
          onChange={(e) => update({ lender: e.target.value })}
          placeholder="e.g. Scotiabank, Hyundai Finance"
        />
      </div>

      <Card className="p-4 bg-accent/5 border-accent/20">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">Payment math</h3>
          <Button type="button" size="sm" variant="secondary" onClick={handleAutoFill}>
            Apply to deal
          </Button>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Pair label="Total due">{formatCurrency(totalDue)}</Pair>
          <Pair label="Down">{formatCurrency(down)}</Pair>
          <Pair label="Financed">{formatCurrency(financed)}</Pair>
          <Pair label="Monthly (est.)" bold>
            {formatCurrency(monthly)}
          </Pair>
        </dl>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MoneyInput
          label="Financed amount"
          name="financedAmount"
          value={data.financedAmount === "" ? Math.round(financed * 100) / 100 : data.financedAmount}
          onChange={(v) => update({ financedAmount: v })}
          helperText="Auto-computed from total due − down. Override if needed."
        />
        <MoneyInput
          label="Payment amount"
          name="paymentAmount"
          value={data.paymentAmount === "" ? Math.round(monthly * 100) / 100 : data.paymentAmount}
          onChange={(v) => update({ paymentAmount: v })}
          helperText="Per-period payment"
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 4: Add-ons                                                     */
/* ------------------------------------------------------------------ */

const PRODUCT_TYPE_OPTIONS = [
  { value: "warranty", label: "Extended warranty" },
  { value: "gap", label: "GAP insurance" },
  { value: "credit_insurance", label: "Credit insurance" },
  { value: "tire_wheel", label: "Tire & wheel" },
  { value: "rust", label: "Rustproofing" },
];

let addOnCounter = 0;

export function DealStep4AddOns({
  data,
  update,
}: WizardStepProps2<DealFormData>) {
  const addAddOn = useCallback(() => {
    addOnCounter += 1;
    const newAddOn: AddOn = {
      id: `ao_${Date.now()}_${addOnCounter}`,
      productType: "warranty",
      provider: "",
      cost: "",
      sellingPrice: "",
      termMonths: 36,
      deductible: 100,
    };
    update({ addOns: [...data.addOns, newAddOn] });
  }, [data.addOns, update]);

  const removeAddOn = useCallback(
    (id: string) => {
      update({ addOns: data.addOns.filter((a) => a.id !== id) });
    },
    [data.addOns, update]
  );

  const updateAddOn = useCallback(
    (id: string, partial: Partial<AddOn>) => {
      update({
        addOns: data.addOns.map((a) => (a.id === id ? { ...a, ...partial } : a)),
      });
    },
    [data.addOns, update]
  );

  const totalCost = data.addOns.reduce(
    (s, a) => s + (a.cost === "" ? 0 : a.cost),
    0
  );
  const totalPrice = data.addOns.reduce(
    (s, a) => s + (a.sellingPrice === "" ? 0 : a.sellingPrice),
    0
  );
  const totalProfit = totalPrice - totalCost;

  return (
    <div className="space-y-5">
      {data.addOns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Shield className="h-8 w-8 text-text-muted mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm text-text-muted">No F&I products added yet</p>
          <p className="text-xs text-text-muted mt-1">
            Add warranty, GAP, or tire & wheel to boost your back-end gross.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.addOns.map((a, idx) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Badge variant="info">F&I #{idx + 1}</Badge>
                  <Select
                    name={`product-type-${a.id}`}
                    value={a.productType}
                    onChange={(v) =>
                      updateAddOn(a.id, { productType: v as AddOn["productType"] })
                    }
                    options={PRODUCT_TYPE_OPTIONS}
                    className="w-48"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeAddOn(a.id)}
                  aria-label="Remove add-on"
                  className="text-text-muted hover:text-danger transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Input
                  label="Provider"
                  name={`provider-${a.id}`}
                  value={a.provider}
                  onChange={(e) => updateAddOn(a.id, { provider: e.target.value })}
                />
                <MoneyInput
                  label="Cost"
                  name={`cost-${a.id}`}
                  value={a.cost}
                  onChange={(v) => updateAddOn(a.id, { cost: v })}
                />
                <MoneyInput
                  label="Selling price"
                  name={`price-${a.id}`}
                  value={a.sellingPrice}
                  onChange={(v) => updateAddOn(a.id, { sellingPrice: v })}
                />
                <Input
                  label="Term (months)"
                  name={`term-${a.id}`}
                  type="number"
                  min={0}
                  value={a.termMonths === "" ? "" : String(a.termMonths)}
                  onChange={(e) =>
                    updateAddOn(a.id, {
                      termMonths: e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Button type="button" variant="secondary" onClick={addAddOn}>
        <Plus className="h-4 w-4" />
        <span>Add F&I product</span>
      </Button>

      {data.addOns.length > 0 && (
        <Card className="p-4 bg-success/5 border-success/20">
          <h3 className="text-sm font-semibold text-text-primary mb-2">F&I totals</h3>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <Pair label="Total cost">{formatCurrency(totalCost)}</Pair>
            <Pair label="Total price">{formatCurrency(totalPrice)}</Pair>
            <Pair label="Back-end gross" bold>
              {formatCurrency(totalProfit)}
            </Pair>
          </dl>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 5: Review                                                      */
/* ------------------------------------------------------------------ */

export function DealStep5Review({
  data,
  update,
}: WizardStepProps2<DealFormData>) {
  const [confirmed, setConfirmed] = useState(false);

  const sale = data.salePrice === "" ? 0 : data.salePrice;
  const trade = data.tradeValue === "" ? 0 : data.tradeValue;
  const taxRate = data.taxRate === "" ? 0 : data.taxRate;
  const feeDoc = data.feeDoc === "" ? 0 : data.feeDoc;
  const feeLicense = data.feeLicense === "" ? 0 : data.feeLicense;
  const feeOther = data.feeOther === "" ? 0 : data.feeOther;
  const down = data.downPayment === "" ? 0 : data.downPayment;

  const taxableBase = Math.max(sale - trade, 0);
  const taxAmount = Math.round(taxableBase * (taxRate / 100) * 100) / 100;
  const totalFees = feeDoc + feeLicense + feeOther;
  const totalDue = Math.max(sale - trade + taxAmount + totalFees, 0);
  const financed = data.financedAmount === "" ? Math.max(totalDue - down, 0) : data.financedAmount;
  const monthly = data.paymentAmount === "" ? 0 : data.paymentAmount;
  const addOnTotal = data.addOns.reduce(
    (s, a) => s + (a.sellingPrice === "" ? 0 : a.sellingPrice),
    0
  );

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Deal summary</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Pair label="Customer">{data.customerName || "—"}</Pair>
          <Pair label="Vehicle">{data.vehicleLabel || "—"}</Pair>
          <Pair label="Deal type">{data.dealType}</Pair>
          <Pair label="Sales rep">
            {USERS.find((u) => u.id === data.assignedToId)?.name ?? "—"}
          </Pair>
        </dl>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Money</h3>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Pair label="Sale">{formatCurrency(sale)}</Pair>
          <Pair label="Trade">{formatCurrency(trade)}</Pair>
          <Pair label="Tax">{formatCurrency(taxAmount)}</Pair>
          <Pair label="Fees">{formatCurrency(totalFees)}</Pair>
          <Pair label="Down">{formatCurrency(down)}</Pair>
          <Pair label="Financed">{formatCurrency(financed)}</Pair>
          <Pair label="Monthly">{formatCurrency(monthly)}</Pair>
          <Pair label="F&I add-ons">{formatCurrency(addOnTotal)}</Pair>
          <Pair label="Total due" bold>
            {formatCurrency(totalDue)}
          </Pair>
        </dl>
      </Card>

      <div>
        <label
          htmlFor="deal-notes"
          className="block text-sm font-medium text-text-primary mb-1.5"
        >
          Notes <span className="text-text-muted font-normal">(optional)</span>
        </label>
        <textarea
          id="deal-notes"
          name="notes"
          value={data.notes}
          onChange={(e) => update({ notes: e.target.value })}
          rows={3}
          placeholder="Anything the F&I manager or delivery team should know…"
          className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
        />
      </div>

      <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-bg-elevated/30 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-border bg-bg-elevated text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
        />
        <div>
          <p className="text-sm font-medium text-text-primary">
            I confirm the deal is accurate
          </p>
          <p className="text-xs text-text-muted">
            The numbers, customer info, and F&I products have been verified. Ready to submit.
          </p>
        </div>
      </label>
    </div>
  );
}

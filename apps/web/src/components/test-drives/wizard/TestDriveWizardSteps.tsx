"use client";

/**
 * Per-step form components for the Schedule Test Drive wizard.
 *
 * Four steps per spec (AdaptUs DMS Module 5):
 *  1. Customer + Vehicle (search/create)
 *  2. Scheduling (date/time/duration/staff/availability)
 *  3. Verification (DL, insurance, signature stubs)
 *  4. Details (contact method, special requirements, reminders)
 */

import { useCallback } from "react";
import { AlertCircle, Car, User, Check } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCustomers } from "@/hooks/useCustomers";
import { useInventory } from "@/hooks/useInventory";
import { cn, formatDate } from "@/lib/utils";
import { USERS } from "@/lib/mock-data";

import type { WizardStepProps2 } from "@/components/common/Wizard";

/* ------------------------------------------------------------------ */
/* Form type                                                           */
/* ------------------------------------------------------------------ */

export interface TestDriveFormData {
  /* Step 1 — Customer + Vehicle */
  customerId: string;
  customerName: string;
  customerPhone: string;
  vehicleId: string;
  vehicleLabel: string;

  /* Step 2 — Scheduling */
  scheduledDate: string;
  scheduledTime: string;
  durationMin: 30 | 45 | 60 | 90;
  assignedToId: string;
  route: "highway" | "city" | "offroad" | "dealer_lot";

  /* Step 3 — Verification */
  dlNumber: string;
  dlExpiry: string;
  insuranceVerified: boolean;
  signatureOnFile: boolean;

  /* Step 4 — Details */
  requestedBy: "walkin" | "phone" | "email" | "website";
  contactMethod: "phone" | "sms" | "email";
  specialRequirements: string;
  sendReminderEmail: boolean;
  sendReminderSms: boolean;
}

export const TEST_DRIVE_INITIAL: TestDriveFormData = {
  customerId: "",
  customerName: "",
  customerPhone: "",
  vehicleId: "",
  vehicleLabel: "",
  scheduledDate: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString().slice(0, 10),
  scheduledTime: "14:00",
  durationMin: 60,
  assignedToId: "",
  route: "city",
  dlNumber: "",
  dlExpiry: "",
  insuranceVerified: false,
  signatureOnFile: false,
  requestedBy: "walkin",
  contactMethod: "sms",
  specialRequirements: "",
  sendReminderEmail: true,
  sendReminderSms: true,
};

/* ------------------------------------------------------------------ */
/* Step 1: Customer + Vehicle                                          */
/* ------------------------------------------------------------------ */

export function TestDriveStep1CustomerVehicle({
  data,
  update,
  errors,
}: WizardStepProps2<TestDriveFormData>) {
  const { data: customers } = useCustomers();
  const { data: vehicles } = useInventory({ status: "available" });

  const selectCustomer = useCallback(
    (id: string) => {
      const c = customers?.find((x) => x.id === id);
      update({
        customerId: id,
        customerName: c?.name ?? "",
        customerPhone: c?.phone ?? "",
      });
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
          htmlFor="customer-pick"
          className="block text-sm font-medium text-text-primary mb-1.5"
        >
          Customer
        </label>
        <Select
          name="customer-pick"
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
              className="h-8 w-8 rounded-full bg-info/20 text-info flex items-center justify-center font-semibold text-xs"
              aria-hidden="true"
            >
              <User className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">{data.customerName}</p>
              <p className="text-xs text-text-muted">{data.customerPhone}</p>
            </div>
          </Card>
        )}
      </div>

      <div>
        <label
          htmlFor="vehicle-pick"
          className="block text-sm font-medium text-text-primary mb-1.5"
        >
          Vehicle to drive
        </label>
        <Select
          name="vehicle-pick"
          value={data.vehicleId}
          onChange={selectVehicle}
          options={[
            { value: "", label: "Select a vehicle…" },
            ...(vehicles
              ?.filter((v) => v.status === "available")
              .map((v) => ({
                value: v.id,
                label: `${v.year} ${v.make} ${v.model} ${v.trim} · ${v.stockNumber}`,
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
            <div>
              <p className="text-sm font-medium text-text-primary">{data.vehicleLabel}</p>
              <p className="text-xs text-text-muted">Available for test drive</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2: Scheduling                                                  */
/* ------------------------------------------------------------------ */

const DURATION_OPTIONS = [
  { value: "30", label: "30 minutes" },
  { value: "45", label: "45 minutes" },
  { value: "60", label: "60 minutes" },
  { value: "90", label: "90 minutes" },
];

const ROUTE_OPTIONS = [
  { value: "city", label: "City route (15 min) — most common" },
  { value: "highway", label: "Highway route (20 min) — highway test" },
  { value: "offroad", label: "Off-road / gravel" },
  { value: "dealer_lot", label: "Dealer lot only" },
];

const TIME_SLOTS = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
];

const SALES_REPS = USERS.filter((u) => u.role === "salesperson" || u.role === "manager" || u.role === "owner");

export function TestDriveStep2Scheduling({
  data,
  update,
  errors,
}: WizardStepProps2<TestDriveFormData>) {
  // Simulated conflict detection
  const conflict = data.assignedToId && data.scheduledDate && data.scheduledTime
    ? `Sales rep may have a back-to-back booking around ${data.scheduledTime}.`
    : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Date"
          name="scheduledDate"
          type="date"
          value={data.scheduledDate}
          onChange={(e) => update({ scheduledDate: e.target.value })}
          error={errors.scheduledDate}
          required
        />
        <div>
          <label
            htmlFor="scheduledTime"
            className="block text-sm font-medium text-text-primary mb-1.5"
          >
            Time
          </label>
          <Select
            name="scheduledTime"
            value={data.scheduledTime}
            onChange={(v) => update({ scheduledTime: v })}
            options={TIME_SLOTS.map((t) => ({ value: t, label: formatTime12(t) }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Duration"
          name="durationMin"
          value={String(data.durationMin)}
          onChange={(v) => update({ durationMin: Number(v) as TestDriveFormData["durationMin"] })}
          options={DURATION_OPTIONS}
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

      <Select
        label="Route"
        name="route"
        value={data.route}
        onChange={(v) => update({ route: v as TestDriveFormData["route"] })}
        options={ROUTE_OPTIONS}
        helperText="Pick a route that matches the vehicle — off-road only for trucks/SUVs."
      />

      {conflict && (
        <Card className="p-3 bg-warning/5 border-warning/20 flex items-start gap-2">
          <AlertCircle
            className="h-4 w-4 text-warning mt-0.5 flex-shrink-0"
            aria-hidden="true"
          />
          <div className="text-sm">
            <p className="font-medium text-warning">Heads up</p>
            <p className="text-text-muted mt-0.5">{conflict}</p>
          </div>
        </Card>
      )}
    </div>
  );
}

function formatTime12(time: string): string {
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

/* ------------------------------------------------------------------ */
/* Step 3: Verification                                                */
/* ------------------------------------------------------------------ */

export function TestDriveStep3Verification({
  data,
  update,
  errors,
}: WizardStepProps2<TestDriveFormData>) {
  const dlValid =
    data.dlNumber.trim().length >= 6 && data.dlExpiry !== "" &&
    new Date(data.dlExpiry) >= new Date();

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Driver&apos;s license #"
          name="dlNumber"
          value={data.dlNumber}
          onChange={(e) => update({ dlNumber: e.target.value.toUpperCase() })}
          error={errors.dlNumber}
        />
        <Input
          label="DL expiry"
          name="dlExpiry"
          type="date"
          value={data.dlExpiry}
          onChange={(e) => update({ dlExpiry: e.target.value })}
          error={errors.dlExpiry}
        />
      </div>

      {data.dlNumber && (
        <Card
          className={cn(
            "p-3 flex items-center gap-2",
            dlValid
              ? "bg-success/5 border-success/20"
              : "bg-danger/5 border-danger/20"
          )}
        >
          {dlValid ? (
            <>
              <Check className="h-4 w-4 text-success" aria-hidden="true" />
              <p className="text-sm text-text-primary">
                Driver&apos;s license looks valid.
              </p>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 text-danger" aria-hidden="true" />
              <p className="text-sm text-text-primary">
                License must be 6+ characters and not expired.
              </p>
            </>
          )}
        </Card>
      )}

      <div className="space-y-2">
        <ChecklistItem
          label="Insurance verified"
          description="Customer has valid insurance that covers a test drive."
          checked={data.insuranceVerified}
          onChange={(v) => update({ insuranceVerified: v })}
        />
        <ChecklistItem
          label="Signature on file"
          description="Customer signed the test-drive waiver and release form."
          checked={data.signatureOnFile}
          onChange={(v) => update({ signatureOnFile: v })}
        />
      </div>

      <p className="text-xs text-text-muted">
        Document upload (front/back of DL) is available on the test drive detail page.
      </p>
    </div>
  );
}

function ChecklistItem({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      aria-label={label}
      htmlFor={`disclaimer-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
        checked
          ? "border-success/30 bg-success/5"
          : "border-border bg-bg-elevated/30 hover:border-border-active"
      )}
    >
      <input
        id={`disclaimer-${label.toLowerCase().replace(/\s+/g, '-')}`}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-border bg-bg-elevated text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
      />
      <div>
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Step 4: Details                                                     */
/* ------------------------------------------------------------------ */

const REQUESTED_BY_OPTIONS = [
  { value: "walkin", label: "Walk-in" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "website", label: "Website" },
];

const CONTACT_METHOD_OPTIONS = [
  { value: "phone", label: "Phone call" },
  { value: "sms", label: "SMS / text" },
  { value: "email", label: "Email" },
];

export function TestDriveStep4Details({
  data,
  update,
}: WizardStepProps2<TestDriveFormData>) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Requested by"
          name="requestedBy"
          value={data.requestedBy}
          onChange={(v) => update({ requestedBy: v as TestDriveFormData["requestedBy"] })}
          options={REQUESTED_BY_OPTIONS}
        />
        <Select
          label="Preferred contact"
          name="contactMethod"
          value={data.contactMethod}
          onChange={(v) => update({ contactMethod: v as TestDriveFormData["contactMethod"] })}
          options={CONTACT_METHOD_OPTIONS}
          helperText="Used to send reminders and confirmations."
        />
      </div>

      <div>
        <label
          htmlFor="specialRequirements"
          className="block text-sm font-medium text-text-primary mb-1.5"
        >
          Special requirements <span className="text-text-muted font-normal">(optional)</span>
        </label>
        <textarea
          id="specialRequirements"
          name="specialRequirements"
          value={data.specialRequirements}
          onChange={(e) => update({ specialRequirements: e.target.value })}
          rows={3}
          placeholder="e.g. needs a car seat, has mobility issues, English is a second language…"
          className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
        />
      </div>

      <Card className="p-4 bg-bg-elevated/30">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Reminders</h3>
        <div className="space-y-2">
          <ReminderToggle
            label="Email reminder 24h before"
            description="Sent to {customerName}&apos;s email."
            checked={data.sendReminderEmail}
            onChange={(v) => update({ sendReminderEmail: v })}
            badge={<Badge variant="info">Recommended</Badge>}
          />
          <ReminderToggle
            label="SMS reminder 2h before"
            description="Sent to {customerPhone}."
            checked={data.sendReminderSms}
            onChange={(v) => update({ sendReminderSms: v })}
            badge={<Badge variant="info">Recommended</Badge>}
          />
        </div>
      </Card>

      {data.customerName && data.scheduledDate && (
        <Card className="p-4 bg-success/5 border-success/20">
          <p className="text-sm font-medium text-text-primary">Ready to schedule</p>
          <p className="text-xs text-text-muted mt-1">
            {data.customerName} · {data.vehicleLabel || "—"} · {formatDate(data.scheduledDate)} at {formatTime12(data.scheduledTime)} · {data.durationMin} min
          </p>
        </Card>
      )}
    </div>
  );
}

function ReminderToggle({
  label,
  description,
  checked,
  onChange,
  badge,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  badge?: React.ReactNode;
}) {
  return (
    <label
      aria-label={label}
      htmlFor={`vehicle-condition-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border cursor-pointer",
        checked
          ? "border-accent/30 bg-accent/5"
          : "border-border bg-bg-card"
      )}
    >
      <input
        id={`vehicle-condition-${label.toLowerCase().replace(/\s+/g, '-')}`}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-border bg-bg-elevated text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-text-primary">{label}</p>
          {badge}
        </div>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
    </label>
  );
}

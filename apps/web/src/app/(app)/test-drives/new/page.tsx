"use client";

/**
 * /test-drives/new — 4-step wizard to schedule a test drive.
 *
 * Steps:
 *  1. Customer + Vehicle
 *  2. Scheduling (date/time/duration/rep/route)
 *  3. Verification (DL, insurance, signature)
 *  4. Details (contact method, requirements, reminders)
 *
 * Built on the reusable <Wizard /> component.
 */

import { z } from "zod";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { Wizard, type WizardStepDef2 } from "@/components/common/Wizard";
import { useWizardValidation } from "@/hooks/useWizardValidation";
import {
  TEST_DRIVE_INITIAL,
  TestDriveFormData,
  TestDriveStep1CustomerVehicle,
  TestDriveStep2Scheduling,
  TestDriveStep3Verification,
  TestDriveStep4Details,
} from "@/components/test-drives/wizard/TestDriveWizardSteps";

const STORAGE_KEY = "wizard:test-drive:v1";

/* ------------------------------------------------------------------ */
/* Per-step schemas                                                    */
/* ------------------------------------------------------------------ */

const step1Schema = z.object({
  customerId: z.string().min(1, "Pick a customer"),
  vehicleId: z.string().min(1, "Pick a vehicle"),
});

const step2Schema = z.object({
  scheduledDate: z.string().min(1, "Pick a date"),
  scheduledTime: z.string().min(1, "Pick a time"),
  durationMin: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90)]),
  assignedToId: z.string().min(1, "Assign a sales rep"),
  route: z.enum(["highway", "city", "offroad", "dealer_lot"]),
});

const step3Schema = z
  .object({
    dlNumber: z.string().min(6, "Driver&apos;s license # is required (6+ chars)"),
    dlExpiry: z
      .string()
      .min(1, "DL expiry is required")
      .refine((d) => new Date(d) >= new Date(new Date().toDateString()), {
        message: "DL is expired",
      }),
    insuranceVerified: z.boolean(),
    signatureOnFile: z.boolean(),
  })
  .refine((d) => d.insuranceVerified, {
    message: "Verify insurance before scheduling the drive",
    path: ["insuranceVerified"],
  })
  .refine((d) => d.signatureOnFile, {
    message: "Waiver signature is required before the customer takes the keys",
    path: ["signatureOnFile"],
  });

const step4Schema = z.object({
  requestedBy: z.enum(["walkin", "phone", "email", "website"]),
  contactMethod: z.enum(["phone", "sms", "email"]),
  specialRequirements: z.string().optional(),
  sendReminderEmail: z.boolean(),
  sendReminderSms: z.boolean(),
});

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function NewTestDrivePage() {
  const router = useRouter();

  const validation = useWizardValidation<TestDriveFormData>({
    step1: { schema: step1Schema, fields: ["customerId", "vehicleId", "customerName", "customerPhone"] },
    step2: { schema: step2Schema, fields: ["scheduledDate", "scheduledTime", "durationMin", "assignedToId", "route"] },
    step3: { schema: step3Schema, fields: ["dlNumber", "dlExpiry", "insuranceVerified", "signatureOnFile"] },
    step4: { schema: step4Schema, fields: ["requestedBy", "contactMethod", "specialRequirements", "sendReminderEmail", "sendReminderSms"] },
  });

  const steps: WizardStepDef2<TestDriveFormData>[] = useMemo(
    () => [
      {
        id: "people",
        title: "Customer + Vehicle",
        description: "Who&apos;s driving and which vehicle?",
        component: TestDriveStep1CustomerVehicle,
        validate: validation.validate.step1,
        validateErrors: validation.errors.step1,
      },
      {
        id: "scheduling",
        title: "Scheduling",
        description: "Pick a date, time, and sales rep. We&apos;ll flag conflicts.",
        component: TestDriveStep2Scheduling,
        validate: validation.validate.step2,
        validateErrors: validation.errors.step2,
      },
      {
        id: "verification",
        title: "Verification",
        description: "Driver&apos;s license, insurance, and waiver — all required to hand over the keys.",
        component: TestDriveStep3Verification,
        validate: validation.validate.step3,
        validateErrors: validation.errors.step3,
      },
      {
        id: "details",
        title: "Details",
        description: "How did the customer reach us, and how should we confirm?",
        component: TestDriveStep4Details,
        validate: validation.validate.step4,
        validateErrors: validation.errors.step4,
        optional: true,
      },
    ],
    [validation.validate, validation.errors]
  );

  const handleComplete = useCallback(
    async (_data: TestDriveFormData) => {
      // In Phase 2, this calls POST /test-drives. For now, redirect to the calendar.
      // We round-trip through the calendar URL so the user sees something useful.
      router.push("/test-drives?created=1");
    },
    [router]
  );

  return (
    <Wizard<TestDriveFormData>
      steps={steps}
      initialData={TEST_DRIVE_INITIAL}
      storageKey={STORAGE_KEY}
      title="Schedule a test drive"
      description="Four steps to put a customer behind the wheel — verification, reminders, and all."
      submitLabel="Schedule drive"
      onComplete={handleComplete}
      maxWidth="lg"
    />
  );
}

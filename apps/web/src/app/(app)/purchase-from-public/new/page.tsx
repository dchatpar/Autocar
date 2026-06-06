"use client";

/**
 * /purchase-from-public/new — 5-step wizard for recording a vehicle purchase
 * from the public (AdaptUs DMS Module 2.4).
 *
 * Steps:
 *  1. Vehicle info (VIN, year, make, model, odometer, condition)
 *  2. Purchase details (date, price, source)
 *  3. Seller info (type, name, contact, address)
 *  4. Documentation (bill of sale, ownership, insurance, inspection)
 *  5. Internal review (checklist, notes)
 *
 * Per-step Zod validation via the shared schemas; the whole flow is
 * data-driven by `<Wizard />` and autosaved every 30s.
 */

import { z } from "zod";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { Wizard, type WizardStepDef2 } from "@/components/common/Wizard";
import { useWizardValidation } from "@/hooks/useWizardValidation";
import { useCreateVehiclePurchase } from "@/hooks/useVehiclePurchases";
import { CreateVehiclePurchaseSchema } from "@dealeros/shared";
import {
  PURCHASE_INITIAL,
  PurchaseFormData,
  PurchaseStep1Vehicle,
  PurchaseStep2Details,
  PurchaseStep3Seller,
  PurchaseStep4Docs,
  PurchaseStep5Review,
} from "@/components/purchases/wizard/PurchaseWizardSteps";

const STORAGE_KEY = "wizard:purchase-from-public:v1";

/* ------------------------------------------------------------------ */
/* Per-step Zod schemas — only the fields each step is responsible for */
/* ------------------------------------------------------------------ */

const step1Schema = z.object({
  vin: z
    .string()
    .min(11, "VIN must be 11–17 characters")
    .max(17, "VIN must be 11–17 characters"),
  year: z.coerce
    .number({ invalid_type_error: "Year is required" })
    .int("Year must be a whole number")
    .min(1900, "Year must be 1900 or later")
    .max(new Date().getFullYear() + 1, "Year cannot be in the future"),
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  trim: z.string().optional(),
  odometer: z.coerce
    .number({ invalid_type_error: "Odometer is required" })
    .int("Odometer must be a whole number")
    .nonnegative("Odometer cannot be negative"),
  exteriorColor: z.string().optional(),
  interiorColor: z.string().optional(),
  condition: z.enum(["EXCELLENT", "GOOD", "FAIR", "POOR", "SALVAGE"]),
});

const step2Schema = z.object({
  purchaseDate: z.string().min(1, "Purchase date is required"),
  purchasePrice: z.coerce
    .number({ invalid_type_error: "Price is required" })
    .nonnegative("Price cannot be negative"),
  source: z.enum(["WALKIN", "PHONE", "ONLINE", "AUCTION", "TRADE_IN", "OTHER"]),
});

const step3Schema = z
  .object({
    sellerName: z.string().min(1, "Seller name is required"),
    sellerPhone: z.string().optional(),
    sellerEmail: z
      .string()
      .email("Enter a valid email")
      .optional()
      .or(z.literal("")),
  })
  .passthrough();

const step4Schema = z
  .object({
    documentNotes: z.string().optional(),
    hasBillOfSale: z.boolean(),
    hasOwnership: z.boolean(),
    hasInsurance: z.boolean(),
    hasInspection: z.boolean(),
  })
  .refine(
    (d) => d.hasBillOfSale || (d.documentNotes?.length ?? 0) > 0,
    {
      message:
        "Bill of sale is normally required — add a note explaining why it&apos;s missing",
      path: ["hasBillOfSale"],
    }
  );

const step5Schema = z.object({
  notes: z.string().optional(),
  acceptedById: z.string().optional(),
  checklistInspection: z.boolean(),
  checklistRecon: z.boolean(),
  checklistPhotos: z.boolean(),
  checklistListed: z.boolean(),
});

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function NewPurchasePage() {
  const router = useRouter();
  const createPurchase = useCreateVehiclePurchase();

  const validation = useWizardValidation<PurchaseFormData>({
    step1: { schema: step1Schema, fields: ["vin", "year", "make", "model", "trim", "odometer", "exteriorColor", "interiorColor", "condition"] },
    step2: { schema: step2Schema, fields: ["purchaseDate", "purchasePrice", "source"] },
    step3: { schema: step3Schema, fields: ["sellerName", "sellerPhone", "sellerEmail"] },
    step4: { schema: step4Schema, fields: ["documentNotes", "hasBillOfSale", "hasOwnership", "hasInsurance", "hasInspection"] },
    step5: { schema: step5Schema, fields: ["notes", "acceptedById", "checklistInspection", "checklistRecon", "checklistPhotos", "checklistListed"] },
  });

  const steps: WizardStepDef2<PurchaseFormData>[] = useMemo(
    () => [
      {
        id: "vehicle",
        title: "Vehicle info",
        description: "VIN, year, make, model, and condition. We&apos;ll auto-decode the basics from the VIN.",
        component: PurchaseStep1Vehicle,
        validate: validation.validate.step1,
        validateErrors: validation.errors.step1,
      },
      {
        id: "details",
        title: "Purchase details",
        description: "When did you buy it, for how much, and from which channel?",
        component: PurchaseStep2Details,
        validate: validation.validate.step2,
        validateErrors: validation.errors.step2,
      },
      {
        id: "seller",
        title: "Seller",
        description: "Who sold you the vehicle? Add their contact so follow-ups are easy.",
        component: PurchaseStep3Seller,
        validate: validation.validate.step3,
        validateErrors: validation.errors.step3,
      },
      {
        id: "docs",
        title: "Documentation",
        description: "Tick off the paperwork you collected. Anything missing can be noted below.",
        component: PurchaseStep4Docs,
        validate: validation.validate.step4,
        validateErrors: validation.errors.step4,
      },
      {
        id: "review",
        title: "Review & accept",
        description: "Sanity check the details, set the internal checklist, and submit.",
        component: PurchaseStep5Review,
        validate: validation.validate.step5,
        validateErrors: validation.errors.step5,
        optional: false,
      },
    ],
    [validation.validate, validation.errors]
  );

  const handleComplete = useCallback(
    async (data: PurchaseFormData) => {
      // Validate against the full shared schema before submitting.
      const parsed = CreateVehiclePurchaseSchema.safeParse({
        vin: data.vin,
        year: data.year,
        make: data.make,
        model: data.model,
        trim: data.trim || undefined,
        odometer: data.odometer,
        exteriorColor: data.exteriorColor || undefined,
        interiorColor: data.interiorColor || undefined,
        condition: data.condition,
        purchaseDate: data.purchaseDate,
        purchasePrice: data.purchasePrice,
        source: data.source,
        sellerType: data.sellerType,
        sellerName: data.sellerName,
        sellerPhone: data.sellerPhone || undefined,
        sellerEmail: data.sellerEmail || undefined,
        sellerAddress: {
          street: data.sellerAddressStreet || undefined,
          city: data.sellerAddressCity || undefined,
          province: data.sellerAddressProvince || undefined,
          postalCode: data.sellerAddressPostal || undefined,
        },
        documents: [
          data.hasBillOfSale && { type: "BILL_OF_SALE" as const },
          data.hasOwnership && { type: "OWNERSHIP" as const },
          data.hasInsurance && { type: "INSURANCE" as const },
          data.hasInspection && { type: "INSPECTION" as const },
        ].filter(Boolean) as Array<{ type: "BILL_OF_SALE" | "OWNERSHIP" | "INSURANCE" | "INSPECTION" }>,
        notes: data.notes || undefined,
        checklist: {
          inspectionComplete: data.checklistInspection,
          reconditioningNeeded: data.checklistRecon,
          photosTaken: data.checklistPhotos,
          listed: data.checklistListed,
        },
      });

      if (!parsed.success) {
        const fieldErrors = parsed.error.issues
          .map((i: { message: string }) => i.message)
          .join("; ");
        throw new Error(`Validation failed: ${fieldErrors}`);
      }

      const created = await createPurchase.mutateAsync(parsed.data);
      router.push(`/purchase-from-public?created=${created.id}`);
    },
    [createPurchase, router]
  );

  return (
    <Wizard<PurchaseFormData>
      steps={steps}
      initialData={PURCHASE_INITIAL}
      storageKey={STORAGE_KEY}
      title="Record a vehicle purchase"
      description="Five quick steps to capture a vehicle bought from the public and link it to your inventory pipeline."
      submitLabel="Save purchase"
      onComplete={handleComplete}
      maxWidth="lg"
    />
  );
}

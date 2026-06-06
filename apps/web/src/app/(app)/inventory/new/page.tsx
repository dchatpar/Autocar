"use client";

/**
 * /inventory/new — 5-step wizard to add a vehicle to inventory.
 *
 * Steps:
 *  1. Basic info (VIN, year, make, model, trim, stock #)
 *  2. Specs (body, fuel, transmission, drivetrain, mileage, color)
 *  3. Pricing (cost, asking, internet, market, floor + margin sanity)
 *  4. Images (URLs of photos — uploader stub for Phase 2)
 *  5. Review (sanity check + internal notes)
 *
 * Built on the reusable <Wizard /> component. Per-step Zod validation,
 * autosave to localStorage every 30s, restore on mount.
 */

import { z } from "zod";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { Wizard, type WizardStepDef2 } from "@/components/common/Wizard";
import { useWizardValidation } from "@/hooks/useWizardValidation";
import { useCreateVehicle } from "@/hooks/useInventory";
import {
  VEHICLE_INITIAL,
  VehicleFormData,
  VehicleStep1Basic,
  VehicleStep2Specs,
  VehicleStep3Pricing,
  VehicleStep4Images,
  VehicleStep5Review,
} from "@/components/inventory/wizard/InventoryWizardSteps";

const STORAGE_KEY = "wizard:add-inventory:v1";

/* ------------------------------------------------------------------ */
/* Per-step schemas                                                    */
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
  stockNumber: z.string().optional(),
  mileage: z.coerce.number().nonnegative().optional(),
});

const step2Schema = z.object({
  bodyStyle: z.enum(["Sedan", "SUV", "Truck", "Coupe", "Wagon", "Van"]).optional().or(z.literal("")),
  fuelType: z.enum(["Gas", "Hybrid", "Electric", "Diesel"]).optional().or(z.literal("")),
  transmission: z.enum(["Automatic", "Manual", "CVT"]).optional().or(z.literal("")),
  drivetrain: z.enum(["FWD", "RWD", "AWD", "4WD"]).optional().or(z.literal("")),
  engine: z.string().optional(),
  exteriorColor: z.string().optional(),
  interiorColor: z.string().optional(),
});

const step3Schema = z.object({
  cost: z.coerce.number().nonnegative().optional(),
  askingPrice: z.coerce.number().nonnegative().optional(),
  internetPrice: z.coerce.number().nonnegative().optional(),
  marketValue: z.coerce.number().nonnegative().optional(),
  floorPlan: z.coerce.number().nonnegative().optional(),
});

const step4Schema = z.object({
  photoUrls: z.array(z.string().url("Each photo must be a valid URL")).optional(),
});

const step5Schema = z.object({
  notes: z.string().optional(),
});

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function NewVehiclePage() {
  const router = useRouter();
  const createVehicle = useCreateVehicle();

  const validation = useWizardValidation<VehicleFormData>({
    step1: { schema: step1Schema, fields: ["vin", "year", "make", "model", "trim", "stockNumber", "mileage"] },
    step2: { schema: step2Schema, fields: ["bodyStyle", "fuelType", "transmission", "drivetrain", "engine", "exteriorColor", "interiorColor"] },
    step3: { schema: step3Schema, fields: ["cost", "askingPrice", "internetPrice", "marketValue", "floorPlan"] },
    step4: { schema: step4Schema, fields: ["photoUrls"] },
    step5: { schema: step5Schema, fields: ["notes"] },
  });

  const steps: WizardStepDef2<VehicleFormData>[] = useMemo(
    () => [
      {
        id: "basic",
        title: "Basic info",
        description: "VIN, year, make, model, trim, stock number.",
        component: VehicleStep1Basic,
        validate: validation.validate.step1,
        validateErrors: validation.errors.step1,
      },
      {
        id: "specs",
        title: "Specs",
        description: "Body style, fuel, transmission, drivetrain, color.",
        component: VehicleStep2Specs,
        validate: validation.validate.step2,
        validateErrors: validation.errors.step2,
        optional: true,
      },
      {
        id: "pricing",
        title: "Pricing",
        description: "Cost, asking, internet, market, floor — we&apos;ll sanity-check the margin.",
        component: VehicleStep3Pricing,
        validate: validation.validate.step3,
        validateErrors: validation.errors.step3,
      },
      {
        id: "images",
        title: "Images",
        description: "Paste CDN URLs for now — direct upload coming soon.",
        component: VehicleStep4Images,
        validate: validation.validate.step4,
        validateErrors: validation.errors.step4,
        optional: true,
      },
      {
        id: "review",
        title: "Review",
        description: "Sanity check the data and add any internal notes.",
        component: VehicleStep5Review,
        validate: validation.validate.step5,
        validateErrors: validation.errors.step5,
      },
    ],
    [validation.validate, validation.errors]
  );

  const handleComplete = useCallback(
    async (data: VehicleFormData) => {
      const created = await createVehicle.mutateAsync({
        vin: data.vin,
        stockNumber: data.stockNumber || undefined,
        year: data.year === "" ? new Date().getFullYear() : Number(data.year),
        make: data.make,
        model: data.model,
        trim: data.trim || undefined,
        price:
          data.internetPrice === ""
            ? data.askingPrice === ""
              ? 0
              : Number(data.askingPrice)
            : Number(data.internetPrice),
        mileage: data.mileage === "" ? 0 : Number(data.mileage),
        color: data.exteriorColor || "",
        bodyStyle: (data.bodyStyle || "Sedan") as Exclude<VehicleFormData["bodyStyle"], "">,
        fuelType: (data.fuelType || "Gas") as Exclude<VehicleFormData["fuelType"], "">,
        transmission: (data.transmission || "Automatic") as Exclude<VehicleFormData["transmission"], "">,
      });
      router.push(`/inventory?created=${created.id}`);
    },
    [createVehicle, router]
  );

  return (
    <Wizard<VehicleFormData>
      steps={steps}
      initialData={VEHICLE_INITIAL}
      storageKey={STORAGE_KEY}
      title="Add a vehicle"
      description="Five steps to add a unit to inventory. We&apos;ll auto-save your progress as you go."
      submitLabel="Add to inventory"
      onComplete={handleComplete}
      maxWidth="lg"
    />
  );
}

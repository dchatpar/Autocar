"use client";

/**
 * /deals/new — 5-step wizard to create a deal.
 *
 * Steps:
 *  1. Basic info (customer, vehicle, deal type, rep)
 *  2. Pricing (sale, trade, tax, fees)
 *  3. Payment (down, APR, term, lender + auto-compute payment)
 *  4. Add-ons (F&I products — warranty, GAP, etc.)
 *  5. Review (summary + confirm)
 *
 * Built on the reusable <Wizard /> component.
 */

import { z } from "zod";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { Wizard, type WizardStepDef2 } from "@/components/common/Wizard";
import { useWizardValidation } from "@/hooks/useWizardValidation";
import {
  DEAL_INITIAL,
  DealFormData,
  DealStep1Basic,
  DealStep2Pricing,
  DealStep3Payment,
  DealStep4AddOns,
  DealStep5Review,
} from "@/components/deals/wizard/DealWizardSteps";

const STORAGE_KEY = "wizard:new-deal:v1";

/* ------------------------------------------------------------------ */
/* Per-step schemas                                                    */
/* ------------------------------------------------------------------ */

const step1Schema = z.object({
  customerId: z.string().min(1, "Pick a customer"),
  vehicleId: z.string().min(1, "Pick a vehicle"),
  dealType: z.enum(["retail", "lease", "bhph", "wholesale", "cash"]),
  assignedToId: z.string().min(1, "Assign a sales rep"),
});

const step2Schema = z.object({
  salePrice: z.coerce.number().nonnegative("Sale price cannot be negative"),
  tradeValue: z.coerce.number().nonnegative().optional(),
  tradePayoff: z.coerce.number().nonnegative().optional(),
  taxRate: z.coerce.number().min(0).max(25).optional(),
  feeDoc: z.coerce.number().nonnegative().optional(),
  feeLicense: z.coerce.number().nonnegative().optional(),
  feeOther: z.coerce.number().nonnegative().optional(),
});

const step3Schema = z.object({
  downPayment: z.coerce.number().nonnegative("Down payment cannot be negative"),
  rate: z.coerce.number().min(0).max(30).optional(),
  termMonths: z.coerce.number().int().min(1).max(84).optional(),
  lender: z.string().optional(),
  financedAmount: z.coerce.number().nonnegative().optional(),
  paymentAmount: z.coerce.number().nonnegative().optional(),
});

const step4Schema = z.object({
  addOns: z
    .array(
      z.object({
        id: z.string(),
        productType: z.enum(["warranty", "gap", "credit_insurance", "tire_wheel", "rust"]),
        provider: z.string().optional(),
        cost: z.coerce.number().nonnegative().optional(),
        sellingPrice: z.coerce.number().nonnegative().optional(),
        termMonths: z.coerce.number().int().nonnegative().optional(),
        deductible: z.coerce.number().nonnegative().optional(),
      })
    )
    .optional(),
});

const step5Schema = z.object({
  notes: z.string().optional(),
});

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function NewDealPage() {
  const router = useRouter();

  const validation = useWizardValidation<DealFormData>({
    step1: { schema: step1Schema, fields: ["customerId", "vehicleId", "customerName", "vehicleLabel", "leadId", "dealType", "assignedToId"] },
    step2: { schema: step2Schema, fields: ["salePrice", "tradeValue", "tradePayoff", "taxRate", "feeDoc", "feeLicense", "feeOther"] },
    step3: { schema: step3Schema, fields: ["downPayment", "rate", "termMonths", "lender", "financedAmount", "paymentAmount"] },
    step4: { schema: step4Schema, fields: ["addOns"] },
    step5: { schema: step5Schema, fields: ["notes"] },
  });

  const steps: WizardStepDef2<DealFormData>[] = useMemo(
    () => [
      {
        id: "basic",
        title: "Basic info",
        description: "Customer, vehicle, deal type, and sales rep.",
        component: DealStep1Basic,
        validate: validation.validate.step1,
        validateErrors: validation.errors.step1,
      },
      {
        id: "pricing",
        title: "Pricing",
        description: "Sale price, trade-in, taxes, and fees. Live math as you type.",
        component: DealStep2Pricing,
        validate: validation.validate.step2,
        validateErrors: validation.errors.step2,
      },
      {
        id: "payment",
        title: "Payment",
        description: "Down payment, APR, term, and lender. We&apos;ll auto-compute the monthly.",
        component: DealStep3Payment,
        validate: validation.validate.step3,
        validateErrors: validation.errors.step3,
      },
      {
        id: "addons",
        title: "Add-ons",
        description: "F&I products that boost your back-end gross.",
        component: DealStep4AddOns,
        validate: validation.validate.step4,
        validateErrors: validation.errors.step4,
        optional: true,
      },
      {
        id: "review",
        title: "Review",
        description: "Sanity check the numbers, then submit.",
        component: DealStep5Review,
        validate: validation.validate.step5,
        validateErrors: validation.errors.step5,
      },
    ],
    [validation.validate, validation.errors]
  );

  const handleComplete = useCallback(
    async (_data: DealFormData) => {
      // In Phase 2, this calls POST /deals. For now, redirect to the pipeline.
      router.push("/pipeline?created=1");
    },
    [router]
  );

  return (
    <Wizard<DealFormData>
      steps={steps}
      initialData={DEAL_INITIAL}
      storageKey={STORAGE_KEY}
      title="Create a deal"
      description="Five steps to put a deal on the board. We&apos;ll auto-save your progress as you go."
      submitLabel="Submit deal"
      onComplete={handleComplete}
      maxWidth="lg"
    />
  );
}

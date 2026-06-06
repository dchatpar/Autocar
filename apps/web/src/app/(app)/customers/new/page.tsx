"use client";

/**
 * /customers/new — 2-step wizard to add a customer.
 *
 * Steps:
 *  1. Personal info (name, email, phone, credit score, source)
 *  2. Contact + notes (address, tags, internal notes)
 *
 * Built on the reusable <Wizard /> component.
 */

import { z } from "zod";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { Wizard, type WizardStepDef2 } from "@/components/common/Wizard";
import { useWizardValidation } from "@/hooks/useWizardValidation";
import { useCreateCustomer } from "@/hooks/useCustomers";
import {
  CUSTOMER_INITIAL,
  CustomerFormData,
  CustomerStep1Personal,
  CustomerStep2Contact,
} from "@/components/customers/wizard/CustomerWizardSteps";

const STORAGE_KEY = "wizard:add-customer:v1";

/* ------------------------------------------------------------------ */
/* Per-step schemas                                                    */
/* ------------------------------------------------------------------ */

const step1Schema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z
    .string()
    .email("Enter a valid email")
    .optional()
    .or(z.literal("")),
  phone: z.string().optional(),
  creditScore: z.coerce
    .number()
    .int("Credit score must be a whole number")
    .min(300, "Minimum credit score is 300")
    .max(850, "Maximum credit score is 850")
    .optional(),
  source: z.string().min(1, "Source is required"),
});

const step2Schema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function NewCustomerPage() {
  const router = useRouter();
  const createCustomer = useCreateCustomer();

  const validation = useWizardValidation<CustomerFormData>({
    step1: { schema: step1Schema, fields: ["firstName", "lastName", "email", "phone", "creditScore", "source"] },
    step2: { schema: step2Schema, fields: ["street", "city", "state", "zip", "tags", "notes"] },
  });

  const steps: WizardStepDef2<CustomerFormData>[] = useMemo(
    () => [
      {
        id: "personal",
        title: "Personal info",
        description: "Name, email, phone, and credit score. Used to compute the credit tier.",
        component: CustomerStep1Personal,
        validate: validation.validate.step1,
        validateErrors: validation.errors.step1,
      },
      {
        id: "contact",
        title: "Contact & notes",
        description: "Address, tags, and any internal notes for the team.",
        component: CustomerStep2Contact,
        validate: validation.validate.step2,
        validateErrors: validation.errors.step2,
        optional: true,
      },
    ],
    [validation.validate, validation.errors]
  );

  const handleComplete = useCallback(
    async (data: CustomerFormData) => {
      const created = await createCustomer.mutateAsync({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || undefined,
        phone: data.phone || undefined,
        address: {
          street: data.street || undefined,
          city: data.city || undefined,
          state: data.state || undefined,
          zip: data.zip || undefined,
        },
        creditScore: data.creditScore === "" ? undefined : Number(data.creditScore),
        source: data.source,
        notes: data.notes || undefined,
        tags: data.tags,
      });
      router.push(`/customers/${created.id}?created=1`);
    },
    [createCustomer, router]
  );

  return (
    <Wizard<CustomerFormData>
      steps={steps}
      initialData={CUSTOMER_INITIAL}
      storageKey={STORAGE_KEY}
      title="Add a customer"
      description="Two quick steps to add a customer to your database."
      submitLabel="Add customer"
      onComplete={handleComplete}
      maxWidth="md"
    />
  );
}

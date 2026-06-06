"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Building2, Users, Clock, Image as ImageIcon, Camera } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MOCK_BUSINESS_HOURS, USERS } from "@/lib/mock-data";
import { formatTimeOfDay } from "@/lib/utils";
import type { BusinessHours, User } from "@/types/api";

const dealerSchema = z.object({
  name: z.string().min(2, "Name is required"),
  subdomain: z
    .string()
    .min(2, "Subdomain is required")
    .regex(/^[a-z0-9-]+$/i, "Only letters, numbers, and hyphens")
    .transform((s) => s.toLowerCase()),
  email: z.string().email("Valid email required"),
  phone: z.string().min(7, "Phone is required"),
  street: z.string().min(2, "Street is required"),
  city: z.string().min(2, "City is required"),
  state: z.string().min(2, "State is required"),
  zip: z.string().min(3, "Zip is required"),
});

type DealerFormValues = z.infer<typeof dealerSchema>;

const ROLE_VARIANT = {
  owner: "accent",
  manager: "info",
  salesperson: "muted",
  admin: "warning",
} as const;

const ROLE_LABEL: Record<User["role"], string> = {
  owner: "Owner",
  manager: "Manager",
  salesperson: "Sales",
  admin: "Admin",
};

export function SettingsView() {
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [hours, setHours] = useState<BusinessHours[]>(MOCK_BUSINESS_HOURS);

  const form = useForm<DealerFormValues>({
    resolver: zodResolver(dealerSchema),
    defaultValues: {
      name: "Apex Auto Group",
      subdomain: "apex-auto",
      email: "contact@apexauto.example",
      phone: "(512) 555-0100",
      street: "2400 N Lamar Blvd",
      city: "Austin",
      state: "TX",
      zip: "78705",
    },
  });

  async function onSubmitProfile(values: DealerFormValues) {
    setSavingProfile(true);
    // Real: await api.put("/api/dealer/profile", values);
    await new Promise((r) => setTimeout(r, 500));
    setSavingProfile(false);
    setSavedAt(new Date().toLocaleTimeString());
  }

  function updateHours(idx: number, patch: Partial<BusinessHours>) {
    setHours((prev) => prev.map((h, i) => (i === idx ? { ...h, ...patch } : h)));
  }

  function toggleClosed(idx: number) {
    setHours((prev) =>
      prev.map((h, i) => (i === idx ? { ...h, closed: !h.closed } : h)),
    );
  }

  return (
    <Tabs
      tabs={[
        {
          id: "profile",
          label: "Dealer profile",
          content: (
            <div className="space-y-6 max-w-3xl">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-text-muted" aria-hidden="true" />
                    <CardTitle>Dealership profile</CardTitle>
                  </div>
                  <CardDescription>Your public dealership information</CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={form.handleSubmit(onSubmitProfile)}
                    className="space-y-4"
                    noValidate
                  >
                    {/* Logo placeholder */}
                    <div>
                      <label className="text-sm font-medium text-text-primary block mb-1.5">
                        Logo
                      </label>
                      <div className="flex items-center gap-4">
                        <div
                          className="h-16 w-16 rounded-xl bg-accent flex items-center justify-center text-bg-primary text-2xl font-bold"
                          aria-hidden="true"
                        >
                          A
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button type="button" variant="secondary" size="sm">
                            <Camera className="h-4 w-4" /> Replace logo
                          </Button>
                          <p className="text-xs text-text-muted">PNG, JPG up to 2MB</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        label="Dealership name"
                        {...form.register("name")}
                        error={form.formState.errors.name?.message}
                      />
                      <Input
                        label="Subdomain"
                        leftIcon={<span className="text-xs text-text-muted">dealeros.app/</span>}
                        helperText="Your custom subdomain on the DealerOS app"
                        {...form.register("subdomain")}
                        error={form.formState.errors.subdomain?.message}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        label="Email"
                        type="email"
                        {...form.register("email")}
                        error={form.formState.errors.email?.message}
                      />
                      <Input
                        label="Phone"
                        type="tel"
                        {...form.register("phone")}
                        error={form.formState.errors.phone?.message}
                      />
                    </div>

                    <fieldset>
                      <legend className="text-sm font-medium text-text-primary mb-2">
                        Address
                      </legend>
                      <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
                        <div className="sm:col-span-6">
                          <Input
                            label="Street"
                            {...form.register("street")}
                            error={form.formState.errors.street?.message}
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <Input
                            label="City"
                            {...form.register("city")}
                            error={form.formState.errors.city?.message}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Input
                            label="State"
                            {...form.register("state")}
                            error={form.formState.errors.state?.message}
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <Input
                            label="Zip"
                            {...form.register("zip")}
                            error={form.formState.errors.zip?.message}
                          />
                        </div>
                      </div>
                    </fieldset>

                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <p className="text-xs text-text-muted" aria-live="polite">
                        {savedAt ? `Saved at ${savedAt}` : "Changes are saved when you click Save."}
                      </p>
                      <Button type="submit" variant="primary" isLoading={savingProfile}>
                        <Save className="h-4 w-4" /> Save changes
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          ),
        },
        {
          id: "users",
          label: "User management",
          content: (
            <Card className="max-w-3xl">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-text-muted" aria-hidden="true" />
                  <CardTitle>Team members</CardTitle>
                </div>
                <CardDescription>Everyone with access to this dealership</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2" role="list" aria-label="Team members">
                  {USERS.map((u) => (
                    <li
                      key={u.id}
                      className="flex items-center gap-3 p-3 bg-bg-elevated border border-border rounded-lg min-h-[56px]"
                    >
                      <div
                        className="h-10 w-10 rounded-full flex items-center justify-center text-bg-primary font-semibold flex-shrink-0"
                        style={{ backgroundColor: u.avatarColor ?? "#E8FF47" }}
                        aria-hidden="true"
                      >
                        {u.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{u.name}</p>
                        <p className="text-xs text-text-muted truncate">{u.email}</p>
                      </div>
                      <Badge variant={ROLE_VARIANT[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex justify-end">
                  <Button variant="secondary">
                    <Users className="h-4 w-4" /> Invite member
                  </Button>
                </div>
              </CardContent>
            </Card>
          ),
        },
        {
          id: "hours",
          label: "Business hours",
          content: (
            <Card className="max-w-2xl">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-text-muted" aria-hidden="true" />
                  <CardTitle>Business hours</CardTitle>
                </div>
                <CardDescription>When customers can reach you</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2" role="list">
                  {hours.map((h, idx) => (
                    <li
                      key={h.day}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-elevated/60 transition-colors min-h-[44px]"
                    >
                      <span className="text-sm font-medium text-text-primary w-24 flex-shrink-0">
                        {h.day}
                      </span>
                      {h.closed ? (
                        <span className="text-sm text-text-muted flex-1">Closed</span>
                      ) : (
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            type="time"
                            value={h.open}
                            onChange={(e) => updateHours(idx, { open: e.target.value })}
                            className="w-32"
                            aria-label={`${h.day} open time`}
                          />
                          <span className="text-text-muted" aria-hidden="true">
                            –
                          </span>
                          <Input
                            type="time"
                            value={h.close}
                            onChange={(e) => updateHours(idx, { close: e.target.value })}
                            className="w-32"
                            aria-label={`${h.day} close time`}
                          />
                          <span className="text-xs text-text-muted hidden md:inline">
                            ({formatTimeOfDay(h.open)} – {formatTimeOfDay(h.close)})
                          </span>
                        </div>
                      )}
                      <label className="inline-flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
                        <input
                          type="checkbox"
                          checked={h.closed}
                          onChange={() => toggleClosed(idx)}
                          className="accent-accent"
                        />
                        <span>Closed</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex justify-end">
                  <Button variant="primary">
                    <Save className="h-4 w-4" /> Save hours
                  </Button>
                </div>
              </CardContent>
            </Card>
          ),
        },
      ]}
    />
  );
}

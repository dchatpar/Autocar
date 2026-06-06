"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Mail,
  Lock,
  User,
  Building2,
  Phone,
  MapPin,
  Plus,
  X,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth, type UserRole, type SignupInput } from "@/hooks/useAuth";
import { useLocalStorage, useHasMounted } from "@/hooks/useLocalStorage";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Validation schemas                                                 */
/* ------------------------------------------------------------------ */

const accountSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().min(1, "Last name is required").max(50),
  email: z.string().min(1, "Email is required").email("Please enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Include at least one uppercase letter")
    .regex(/[0-9]/, "Include at least one number"),
});
type AccountValues = z.infer<typeof accountSchema>;

const dealerSchema = z.object({
  dealerName: z.string().min(2, "Dealership name is required").max(80),
  dealerType: z.enum(["franchise", "independent", "used-only"]),
  phone: z
    .string()
    .min(10, "Enter a valid phone number")
    // eslint-disable-next-line no-useless-escape
    .regex(/^[\d\s+()\-]+$/, "Phone number contains invalid characters"),
  city: z.string().min(1, "City is required").max(60),
  state: z.string().min(2, "State is required").max(40),
});
type DealerValues = z.infer<typeof dealerSchema>;

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.enum(["manager", "salesperson"]),
});
type InviteValues = z.infer<typeof inviteSchema>;

const teamSchema = z.object({
  invites: z.array(inviteSchema).max(10, "You can invite up to 10 teammates"),
});
type TeamValues = z.infer<typeof teamSchema>;

/* ------------------------------------------------------------------ */
/* Local-storage draft shape                                          */
/* ------------------------------------------------------------------ */

const DRAFT_KEY = "dealeros.signup.draft";

interface DraftState {
  account: Partial<AccountValues>;
  dealer: Partial<DealerValues>;
  invites: InviteValues[];
  step: 0 | 1 | 2;
  savedAt: string;
}

const EMPTY_DRAFT: DraftState = {
  account: {},
  dealer: {},
  invites: [],
  step: 0,
  savedAt: "",
};

const STEPS = [
  { id: 0, title: "Account", short: "Account info" },
  { id: 1, title: "Dealer", short: "Dealer info" },
  { id: 2, title: "Team", short: "Invite team" },
] as const;

export function SignupWizard() {
  const router = useRouter();
  const { signup, isLoading, error, clearError } = useAuth();
  const [draft, setDraft] = useLocalStorage<DraftState>(DRAFT_KEY, EMPTY_DRAFT);
  const [step, setStep] = useState<DraftState["step"]>(draft.step ?? 0);
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const hydrated = useHasMounted();

  // Show "Restore draft?" banner if a draft exists from a prior visit.
  useEffect(() => {
    if (!hydrated) return;
    if (draft.savedAt) {
      const hasData =
        Object.keys(draft.account).length > 0 ||
        Object.keys(draft.dealer).length > 0 ||
        draft.invites.length > 0;
      if (hasData) setShowRestoreBanner(true);
    }
  }, [hydrated, draft]);

  // ----- Step 1: Account -----
  const accountForm = useForm<AccountValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      firstName: draft.account.firstName ?? "",
      lastName: draft.account.lastName ?? "",
      email: draft.account.email ?? "",
      password: draft.account.password ?? "",
    },
    mode: "onBlur",
  });

  // ----- Step 2: Dealer -----
  const dealerForm = useForm<DealerValues>({
    resolver: zodResolver(dealerSchema),
    defaultValues: {
      dealerName: draft.dealer.dealerName ?? "",
      dealerType: (draft.dealer.dealerType as DealerValues["dealerType"]) ?? "franchise",
      phone: draft.dealer.phone ?? "",
      city: draft.dealer.city ?? "",
      state: draft.dealer.state ?? "",
    },
    mode: "onBlur",
  });

  // ----- Step 3: Team -----
  const [invites, setInvites] = useState<InviteValues[]>(draft.invites ?? []);

  /* ------------------------------------------------------------------ */
  /* Auto-save draft (debounced 600ms)                                  */
  /* ------------------------------------------------------------------ */

  const watchedAccount = useDebounce(accountForm.watch(), 600);
  const watchedDealer = useDebounce(dealerForm.watch(), 600);

  useEffect(() => {
    if (!hydrated) return;
    setDraft((prev) => ({
      ...prev,
      account: {
        firstName: watchedAccount.firstName ?? "",
        lastName: watchedAccount.lastName ?? "",
        email: watchedAccount.email ?? "",
        password: watchedAccount.password ?? "",
      },
      savedAt: new Date().toISOString(),
    }));
  }, [watchedAccount, setDraft, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    setDraft((prev) => ({
      ...prev,
      dealer: {
        dealerName: watchedDealer.dealerName ?? "",
        dealerType: watchedDealer.dealerType ?? "franchise",
        phone: watchedDealer.phone ?? "",
        city: watchedDealer.city ?? "",
        state: watchedDealer.state ?? "",
      },
      savedAt: new Date().toISOString(),
    }));
  }, [watchedDealer, setDraft, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    setDraft((prev) => ({ ...prev, invites, step, savedAt: new Date().toISOString() }));
  }, [invites, step, setDraft, hydrated]);

  /* ------------------------------------------------------------------ */
  /* Step navigation                                                    */
  /* ------------------------------------------------------------------ */

  const goNextAccount: SubmitHandler<AccountValues> = (values) => {
    setStep(1);
  };
  const goNextDealer: SubmitHandler<DealerValues> = (values) => {
    setStep(2);
  };

  const handleFinalSubmit = async () => {
    clearError();
    const account = accountForm.getValues();
    const dealer = dealerForm.getValues();

    // Validate team invites before submitting
    const teamResult = teamSchema.safeParse({ invites });
    if (!teamResult.success) {
      // surface first invite error
      const firstIssue = teamResult.error.issues[0];
      if (firstIssue) {
        // Toast-like inline error — push to error banner by reusing error slot
        // The simplest: just stay on step 2 and rely on UI to show issues
      }
      return;
    }

    try {
      await signup.mutateAsync({
        ...account,
        ...dealer,
        invites,
      });
      // Clear draft on success
      setDraft(EMPTY_DRAFT);
      router.push("/");
    } catch {
      /* error surfaced via useAuth */
    }
  };

  const discardDraft = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    accountForm.reset({ firstName: "", lastName: "", email: "", password: "" });
    dealerForm.reset({ dealerName: "", dealerType: "franchise", phone: "", city: "", state: "" });
    setInvites([]);
    setStep(0);
    setShowRestoreBanner(false);
  }, [setDraft, accountForm, dealerForm]);

  /* ------------------------------------------------------------------ */
  /* Render                                                             */
  /* ------------------------------------------------------------------ */

  const progressPct = useMemo(() => ((step + 1) / STEPS.length) * 100, [step]);

  return (
    <div className="w-full max-w-xl">
      {/* Progress bar */}
      <div className="mb-7">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-medium text-text-muted">
            Step {step + 1} of {STEPS.length}
          </span>
          <span className="text-xs text-text-muted">
            {Math.round(progressPct)}% complete
          </span>
        </div>
        <div
          className="h-1.5 w-full rounded-full bg-bg-elevated overflow-hidden"
          role="progressbar"
          aria-valuenow={Math.round(progressPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Sign-up progress"
        >
          <div
            className="h-full bg-accent transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <ol className="mt-4 grid grid-cols-3 gap-2">
          {STEPS.map((s) => {
            const isComplete = step > s.id;
            const isCurrent = step === s.id;
            return (
              <li
                key={s.id}
                className={cn(
                  "flex items-center gap-2 text-xs font-medium",
                  isComplete && "text-success",
                  isCurrent && "text-accent",
                  !isComplete && !isCurrent && "text-text-muted"
                )}
              >
                <span
                  className={cn(
                    "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0",
                    isComplete && "bg-success text-bg-primary",
                    isCurrent && "bg-accent text-bg-primary",
                    !isComplete && !isCurrent && "bg-bg-elevated text-text-muted"
                  )}
                  aria-hidden="true"
                >
                  {isComplete ? <Check className="h-3 w-3" /> : s.id + 1}
                </span>
                <span className="truncate">{s.short}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="rounded-2xl border border-border bg-bg-card p-7 sm:p-9 shadow-2xl shadow-black/40">
        {showRestoreBanner && (
          <div
            role="status"
            className="mb-5 flex items-start gap-2.5 rounded-lg border border-info/30 bg-info/10 px-3.5 py-2.5 text-sm text-info"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">We restored your previous progress.</p>
              <p className="text-xs opacity-90 mt-0.5">
                Drafts are saved locally on this device.
              </p>
            </div>
            <button
              type="button"
              onClick={discardDraft}
              className="text-xs underline underline-offset-2 hover:opacity-80"
            >
              Start over
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">{error.message}</p>
              {error.retryable && (
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    handleFinalSubmit();
                  }}
                  className="mt-1 text-xs underline underline-offset-2 hover:text-danger/80"
                >
                  Try again
                </button>
              )}
            </div>
          </div>
        )}

        {/* ---------- Step 0: Account ---------- */}
        {step === 0 && (
          <form onSubmit={accountForm.handleSubmit(goNextAccount)} noValidate className="space-y-4">
            <header className="mb-5">
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">
                Create your account
              </h1>
              <p className="text-sm text-text-muted mt-1.5">
                Start your 14-day free trial. No credit card required.
              </p>
            </header>

            <div className="grid grid-cols-2 gap-3">
              <Input
                {...accountForm.register("firstName")}
                label="First name"
                placeholder="Alex"
                autoComplete="given-name"
                leftIcon={<User className="h-4 w-4" aria-hidden="true" />}
                error={accountForm.formState.errors.firstName?.message}
                required
              />
              <Input
                {...accountForm.register("lastName")}
                label="Last name"
                placeholder="Morgan"
                autoComplete="family-name"
                error={accountForm.formState.errors.lastName?.message}
                required
              />
            </div>

            <Input
              {...accountForm.register("email")}
              type="email"
              label="Work email"
              placeholder="you@dealership.com"
              autoComplete="email"
              inputMode="email"
              leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
              error={accountForm.formState.errors.email?.message}
              required
            />

            <Input
              {...accountForm.register("password")}
              type="password"
              label="Password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              leftIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
              helperText="At least 8 chars, one uppercase, one number."
              error={accountForm.formState.errors.password?.message}
              required
            />

            <Button type="submit" variant="primary" size="lg" className="w-full mt-2">
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        )}

        {/* ---------- Step 1: Dealer ---------- */}
        {step === 1 && (
          <form onSubmit={dealerForm.handleSubmit(goNextDealer)} noValidate className="space-y-4">
            <header className="mb-5">
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">
                Tell us about your dealership
              </h1>
              <p className="text-sm text-text-muted mt-1.5">
                We&apos;ll customize DealerOS for your team.
              </p>
            </header>

            <Input
              {...dealerForm.register("dealerName")}
              label="Dealership name"
              placeholder="e.g. Sunrise Auto Group"
              autoComplete="organization"
              leftIcon={<Building2 className="h-4 w-4" aria-hidden="true" />}
              error={dealerForm.formState.errors.dealerName?.message}
              required
            />

            <div>
              <div className="block text-sm font-medium text-text-primary mb-2" aria-hidden="true">
                Dealer type
              </div>
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Dealer type">
                {(
                  [
                    { value: "franchise", label: "Franchise" },
                    { value: "independent", label: "Independent" },
                    { value: "used-only", label: "Used only" },
                  ] as const
                ).map((opt) => {
                  const selected = dealerForm.watch("dealerType") === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => dealerForm.setValue("dealerType", opt.value, { shouldValidate: true })}
                      className={cn(
                        "h-11 rounded-lg border text-sm font-medium transition-all",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        selected
                          ? "bg-accent/10 border-accent text-text-primary"
                          : "bg-bg-elevated border-border text-text-muted hover:border-border-active hover:text-text-primary"
                      )}
                      aria-pressed={selected}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {dealerForm.formState.errors.dealerType && (
                <p className="text-sm text-danger mt-1.5">
                  {dealerForm.formState.errors.dealerType.message}
                </p>
              )}
            </div>

            <Input
              {...dealerForm.register("phone")}
              type="tel"
              label="Phone"
              placeholder="(555) 123-4567"
              autoComplete="tel"
              inputMode="tel"
              leftIcon={<Phone className="h-4 w-4" aria-hidden="true" />}
              error={dealerForm.formState.errors.phone?.message}
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                {...dealerForm.register("city")}
                label="City"
                placeholder="Austin"
                autoComplete="address-level2"
                leftIcon={<MapPin className="h-4 w-4" aria-hidden="true" />}
                error={dealerForm.formState.errors.city?.message}
                required
              />
              <Input
                {...dealerForm.register("state")}
                label="State"
                placeholder="TX"
                autoComplete="address-level1"
                error={dealerForm.formState.errors.state?.message}
                required
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => setStep(0)}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button type="submit" variant="primary" size="lg" className="flex-1">
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </form>
        )}

        {/* ---------- Step 2: Team ---------- */}
        {step === 2 && (
          <div className="space-y-5">
            <header className="mb-5">
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">
                Invite your team
              </h1>
              <p className="text-sm text-text-muted mt-1.5">
                Optional — you can add teammates later from Settings.
              </p>
            </header>

            <InviteEditor invites={invites} onChange={setInvites} />

            <div className="rounded-lg border border-border bg-bg-elevated/40 p-3.5 flex items-start gap-2.5 text-xs text-text-muted">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-success flex-shrink-0" />
              <span>
                We&apos;ll email each invitee a link to join{" "}
                <span className="text-text-primary font-medium">
                  {dealerForm.watch("dealerName") || "your dealership"}
                </span>
                . They expire in 7 days.
              </span>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => setStep(1)}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                type="button"
                variant="primary"
                size="lg"
                className="flex-1"
                isLoading={signup.isPending || isLoading}
                disabled={signup.isPending || isLoading}
                onClick={handleFinalSubmit}
              >
                {signup.isPending || isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating account…
                  </>
                ) : (
                  <>
                    Create account
                    <Check className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        <p className="mt-7 text-center text-sm text-text-muted">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Invite editor — small inline component                             */
/* ------------------------------------------------------------------ */

interface InviteEditorProps {
  invites: InviteValues[];
  onChange: (next: InviteValues[]) => void;
}

function InviteEditor({ invites, onChange }: InviteEditorProps) {
  const [draftEmail, setDraftEmail] = useState("");
  const [draftRole, setDraftRole] = useState<Exclude<UserRole, "owner" | "admin">>("salesperson");
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const parsed = inviteSchema.safeParse({ email: draftEmail.trim(), role: draftRole });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid invite");
      return;
    }
    if (invites.some((i) => i.email.toLowerCase() === parsed.data.email.toLowerCase())) {
      setError("That email has already been invited");
      return;
    }
    onChange([...invites, parsed.data]);
    setDraftEmail("");
    setError(null);
  };

  const remove = (idx: number) => onChange(invites.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          type="email"
          value={draftEmail}
          onChange={(e) => {
            setDraftEmail(e.target.value);
            if (error) setError(null);
          }}
          placeholder="teammate@dealership.com"
          leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
          error={error ?? undefined}
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <select
          value={draftRole}
          onChange={(e) => setDraftRole(e.target.value as typeof draftRole)}
          className="h-10 px-3 rounded-lg bg-bg-elevated border border-border text-text-primary text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          aria-label="Invite role"
        >
          <option value="salesperson">Salesperson</option>
          <option value="manager">Manager</option>
        </select>
        <Button type="button" variant="secondary" size="md" onClick={add}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      {invites.length > 0 && (
        <ul className="space-y-2">
          {invites.map((inv, idx) => (
            <li
              key={`${inv.email}-${idx}`}
              className="flex items-center gap-2.5 rounded-lg border border-border bg-bg-elevated/40 px-3 py-2"
            >
              <span
                aria-hidden="true"
                className="h-7 w-7 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center"
              >
                {(inv.email[0] ?? "?").toUpperCase()}
              </span>
              <span className="flex-1 text-sm text-text-primary truncate">
                {inv.email}
              </span>
              <span className="text-xs text-text-muted capitalize">{inv.role}</span>
              <button
                type="button"
                onClick={() => remove(idx)}
                aria-label={`Remove invite for ${inv.email}`}
                className="h-7 w-7 rounded-md flex items-center justify-center text-text-muted hover:text-danger hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

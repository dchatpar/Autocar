"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Lock, Eye, EyeOff, ArrowLeft, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Include at least one uppercase letter")
      .regex(/[0-9]/, "Include at least one number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
type Values = z.infer<typeof schema>;

interface ResetPasswordFormProps {
  searchParamsPromise: Promise<{ token?: string }>;
}

export function ResetPasswordForm({ searchParamsPromise }: ResetPasswordFormProps) {
  const params = use(searchParamsPromise);
  const router = useRouter();
  const { resetPassword, isLoading, error, clearError } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
    mode: "onBlur",
  });

  const onSubmit = handleSubmit(async (values) => {
    clearError();
    try {
      await resetPassword.mutateAsync({
        token: params.token ?? "",
        password: values.password,
        confirmPassword: values.confirmPassword,
      });
      setDone(true);
    } catch {
      /* error surfaced via useAuth */
    }
  });

  const isPending = isSubmitting || resetPassword.isPending;
  const passwordValue = watch("password") ?? "";
  const tokenMissing = !params.token;

  // Password strength meter (very lightweight, 0–4 bars)
  const strength = scorePassword(passwordValue);

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-border bg-bg-card p-7 sm:p-9 shadow-2xl shadow-black/40">
        {tokenMissing && !done ? (
          <div className="text-center">
            <div
              className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-danger/15 text-danger flex items-center justify-center"
              aria-hidden="true"
            >
              <AlertCircle className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary mb-2">
              Invalid reset link
            </h1>
            <p className="text-sm text-text-muted leading-relaxed max-w-sm mx-auto">
              This password reset link is missing a token. Request a new link to
              continue.
            </p>
            <div className="mt-7">
              <Link href="/forgot-password">
                <Button type="button" variant="primary" size="md">
                  Request a new link
                </Button>
              </Link>
            </div>
          </div>
        ) : !done ? (
          <>
            <header className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
                Set a new password
              </h1>
              <p className="text-sm text-text-muted mt-1.5">
                Choose a strong password you don&apos;t use anywhere else.
              </p>
            </header>

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
                        onSubmit();
                      }}
                      className="mt-1 text-xs underline underline-offset-2 hover:text-danger/80"
                    >
                      Try again
                    </button>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <div>
                <Input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  label="New password"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  leftIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded p-0.5"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  }
                  error={errors.password?.message}
                  disabled={isPending}
                  required
                  autoFocus
                />
                {passwordValue.length > 0 && (
                  <div className="mt-2 flex items-center gap-2" aria-hidden="true">
                    <div className="flex flex-1 gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-colors ${
                            i < strength
                              ? strength <= 1
                                ? "bg-danger"
                                : strength === 2
                                ? "bg-warning"
                                : "bg-success"
                              : "bg-bg-elevated"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-text-muted w-12 text-right">
                      {strength <= 1 ? "Weak" : strength === 2 ? "Okay" : strength === 3 ? "Good" : "Strong"}
                    </span>
                  </div>
                )}
              </div>

              <Input
                {...register("confirmPassword")}
                type={showConfirm ? "text" : "password"}
                label="Confirm new password"
                placeholder="Re-enter your password"
                autoComplete="new-password"
                leftIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowConfirm((p) => !p)}
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                    className="text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded p-0.5"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
                error={errors.confirmPassword?.message}
                disabled={isPending}
                required
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isPending}
                disabled={isPending}
                className="w-full"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating password…
                  </>
                ) : (
                  "Update password"
                )}
              </Button>
            </form>
          </>
        ) : (
          <div className="text-center">
            <div
              className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-success/15 text-success flex items-center justify-center"
              aria-hidden="true"
            >
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary mb-2">
              Password updated
            </h1>
            <p className="text-sm text-text-muted leading-relaxed max-w-sm mx-auto">
              Your password has been reset. You can now sign in with your new credentials.
            </p>
            <div className="mt-7">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => router.push("/login")}
              >
                Continue to sign in
              </Button>
            </div>
          </div>
        )}

        <div className="mt-7 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

/* Tiny, transparent password scorer — 0..4 */
function scorePassword(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 14) score++;
  return Math.max(0, Math.min(4, score));
}

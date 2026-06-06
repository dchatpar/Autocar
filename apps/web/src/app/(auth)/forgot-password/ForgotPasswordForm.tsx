"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, ArrowLeft, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Please enter a valid email"),
});
type Values = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const { forgotPassword, isLoading, error, clearError } = useAuth();
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
    mode: "onBlur",
  });

  const onSubmit = handleSubmit(async (values) => {
    clearError();
    try {
      await forgotPassword.mutateAsync({ email: values.email });
      setSubmittedEmail(values.email);
    } catch {
      /* error surfaced via useAuth */
    }
  });

  const isPending = isSubmitting || forgotPassword.isPending;

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-border bg-bg-card p-7 sm:p-9 shadow-2xl shadow-black/40">
        {!submittedEmail ? (
          <>
            <header className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
                Forgot your password?
              </h1>
              <p className="text-sm text-text-muted mt-1.5">
                Enter the email associated with your account and we&apos;ll send
                you a link to reset your password.
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
              <Input
                {...register("email")}
                type="email"
                label="Email"
                placeholder="you@dealership.com"
                autoComplete="email"
                inputMode="email"
                leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
                error={errors.email?.message}
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
                    Sending link…
                  </>
                ) : (
                  "Send reset link"
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
              Check your inbox
            </h1>
            <p className="text-sm text-text-muted leading-relaxed max-w-sm mx-auto">
              We sent a password reset link to{" "}
              <span className="text-text-primary font-medium">{submittedEmail}</span>.
              The link expires in 30 minutes.
            </p>
            <div className="mt-6 rounded-lg border border-border bg-bg-elevated/40 p-3.5 text-left text-xs text-text-muted space-y-1.5">
              <p>• Didn&apos;t get it? Check your spam folder.</p>
              <p>• Still nothing? Verify you used the email on file.</p>
            </div>
            <div className="mt-7 flex flex-col gap-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => {
                  setSubmittedEmail(null);
                  clearError();
                }}
              >
                Send to a different email
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

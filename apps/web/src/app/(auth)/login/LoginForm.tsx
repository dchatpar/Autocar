"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(6, "Password must be at least 6 characters"),
  rememberMe: z.boolean().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

interface LoginFormProps {
  searchParamsPromise: Promise<{ redirect?: string; signedOut?: string }>;
}

export function LoginForm({ searchParamsPromise }: LoginFormProps) {
  const router = useRouter();
  const { user, login, isLoading, error, clearError } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [signedOutNotice, setSignedOutNotice] = useState(false);

  // Unwrap the search params once
  const params = use(searchParamsPromise);
  const redirectTo = params.redirect && params.redirect.startsWith("/") ? params.redirect : "/";
  useEffect(() => {
    if (params.signedOut) setSignedOutNotice(true);
  }, [params.signedOut]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: false },
    mode: "onBlur",
  });

  // If we already have a session, bounce to redirect target.
  useEffect(() => {
    if (user && !isLoading) {
      router.replace(redirectTo);
    }
  }, [user, isLoading, router, redirectTo]);

  const onSubmit = handleSubmit(async (values) => {
    clearError();
    try {
      await login.mutateAsync({ email: values.email, password: values.password, rememberMe: values.rememberMe });
      router.push(redirectTo);
    } catch {
      /* error surfaced via `error` from useAuth */
    }
  });

  const authError = error;
  const isPending = isSubmitting || login.isPending;

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-border bg-bg-card p-7 sm:p-9 shadow-2xl shadow-black/40">
        <header className="mb-7">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
            Welcome back
          </h1>
          <p className="text-sm text-text-muted mt-1.5">
            Sign in to your DealerOS account to continue.
          </p>
        </header>

        {signedOutNotice && (
          <div
            role="status"
            className="mb-5 flex items-start gap-2.5 rounded-lg border border-info/30 bg-info/10 px-3.5 py-2.5 text-sm text-info"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>You have been signed out. Please sign in again.</span>
          </div>
        )}

        {authError && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-medium">{authError.message}</p>
              {authError.retryable && (
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    onSubmit();
                  }}
                  className="mt-1 text-xs underline underline-offset-2 hover:text-danger/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger rounded"
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

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="password"
                className="text-sm font-medium text-text-primary"
              >
                Password
              </label>
              <Link
                href="/forgot-password"
                tabIndex={isPending ? -1 : 0}
                className="text-xs text-text-muted hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              {...register("password")}
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              autoComplete="current-password"
              leftIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  tabIndex={0}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="text-text-muted hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded p-0.5"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              }
              error={errors.password?.message}
              disabled={isPending}
              required
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer group select-none py-1">
            <input
              {...register("rememberMe")}
              type="checkbox"
              className="h-4 w-4 rounded border-border bg-bg-elevated text-accent focus:ring-2 focus:ring-accent focus:ring-offset-0 cursor-pointer accent-[#E8FF47]"
              disabled={isPending}
            />
            <span className="text-sm text-text-muted group-hover:text-text-primary transition-colors">
              Keep me signed in
            </span>
          </label>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isPending}
            disabled={isPending}
            className="w-full mt-2"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-text-muted">
          <span className="h-px flex-1 bg-border" />
          <span>OR</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="w-full"
          disabled={isPending}
        >
          <GoogleIcon />
          Continue with Google
        </Button>

        <p className="mt-7 text-center text-sm text-text-muted">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.43 3.44 1.18 4.93l3.66-2.83Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

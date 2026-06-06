import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in — DealerOS",
  description: "Sign in to your DealerOS account to manage leads, inventory, and deals.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; signedOut?: string }>;
}) {
  return <LoginForm searchParamsPromise={searchParams} />;
}

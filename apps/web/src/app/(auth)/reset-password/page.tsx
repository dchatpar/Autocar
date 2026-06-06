import type { Metadata } from "next";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Set a new password — DealerOS",
  description: "Choose a new password for your DealerOS account.",
};

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return <ResetPasswordForm searchParamsPromise={searchParams} />;
}

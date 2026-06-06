import type { Metadata } from "next";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Reset your password — DealerOS",
  description: "Request a password reset link for your DealerOS account.",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}

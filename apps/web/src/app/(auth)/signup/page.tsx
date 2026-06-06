import type { Metadata } from "next";
import { SignupWizard } from "./SignupWizard";

export const metadata: Metadata = {
  title: "Create your account — DealerOS",
  description: "Set up your dealership on DealerOS in three quick steps.",
};

export default function SignupPage() {
  return <SignupWizard />;
}

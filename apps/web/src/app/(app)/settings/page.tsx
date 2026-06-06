import { PageHeader } from "@/components/layout";
import { SettingsView } from "@/components/settings/SettingsView";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your dealership profile, team, and business hours."
      />
      <SettingsView />
    </>
  );
}

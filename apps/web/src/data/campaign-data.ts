import type { CampaignTriggerType, CampaignStepInput } from "@/types/api";
import type { AudienceValue } from "@/components/campaigns/AudienceBuilder";

// NOTE: exported as default to avoid Next.js 15 flight-loader re-export conflict
export type CampaignFormData = {
  name: string;
  description: string;
  triggerType: CampaignTriggerType | null;
  triggerConfig: Record<string, unknown>;
  audience: AudienceValue;
  steps: CampaignStepInput[];
};

const CAMPAIGN_INITIAL: CampaignFormData = {
  name: "",
  description: "",
  triggerType: null,
  triggerConfig: {},
  audience: {
    includeCustomers: true,
    maxEnroll: 500,
  },
  steps: [],
};

export default CAMPAIGN_INITIAL;

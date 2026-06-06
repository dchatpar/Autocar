import type { CampaignFormData } from "@/types/api";

export type { CampaignFormData };

// NOTE: exported as default to avoid Next.js 15 flight-loader re-export conflict
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

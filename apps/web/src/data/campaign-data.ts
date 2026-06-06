import type { CampaignFormData } from "@/types/api";

export { CAMPAIGN_INITIAL };
export type { CampaignFormData };

export const CAMPAIGN_INITIAL: CampaignFormData = {
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

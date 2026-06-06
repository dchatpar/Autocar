export { useAuth, type User, type UserRole, type LoginInput, type SignupInput, type SignupAccountInput, type SignupDealerInput, type SignupTeamInput, type ForgotPasswordInput, type ResetPasswordInput, type AuthError } from "./useAuth";
export { useDebounce, useDebouncedCallback } from "./useDebounce";
export { useLocalStorage, useHasMounted } from "./useLocalStorage";

// Multi-step Wizard
export {
  useWizardState,
  type WizardStepDef,
  type UseWizardStateOptions,
  type UseWizardStateResult,
} from "./useWizardState";
export {
  useWizardValidation,
  type WizardValidationConfig,
  type UseWizardValidationResult,
} from "./useWizardValidation";

// Leads
export {
  useLeads,
  useLead,
  useUpdateLeadStatus,
  useCreateLead,
  useLocalLeads,
  leadKeys,
} from "./useLeads";

// Inventory
export {
  useInventory,
  useVehicle,
  useCreateVehicle,
  useUpdateVehicleStatus,
  useDecodeVin,
  vehicleKeys,
} from "./useInventory";

// Customers
export {
  useCustomers,
  useCustomer,
  useAddCustomerNote,
  useCreateCustomer,
  type CreateCustomerInput,
  customerKeys,
} from "./useCustomers";

// Duplicate detection & merge
export {
  useFindDuplicates,
  useDuplicateList,
  usePreviewMerge,
  useMergeCustomers,
  useUnmergeCustomers,
  useDismissDuplicate,
  duplicateKeys,
  type DuplicateMatch,
  type FindDuplicatesResult,
  type FieldChoice,
  type FieldChoices,
  type MergeableField,
  type MergePreview,
  type MergeRequest,
  type MergeResult,
  type CustomerLite as DuplicateCustomerLite,
  type DuplicateClassification,
  type DuplicateStatus,
  type DuplicateListFilters,
  type DuplicateListItem,
} from "./useDuplicateDetection";

// Vehicle Purchases (AdaptUs DMS Module 2.4)
export {
  useVehiclePurchases,
  useVehiclePurchase,
  useCreateVehiclePurchase,
  useUpdateVehiclePurchase,
  useDeleteVehiclePurchase,
  usePrintPurchasePDF,
  vehiclePurchaseKeys,
  type VehiclePurchaseFilters,
} from "./useVehiclePurchases";

// Marketing Campaigns
export {
  useCampaigns,
  useCampaign,
  useCampaignStats,
  useCampaignEnrollments,
  useCreateCampaign,
  useUpdateCampaign,
  useActivateCampaign,
  usePauseCampaign,
  useArchiveCampaign,
  useEnrollInCampaign,
  useUnenrollFromCampaign,
  campaignKeys,
  type CampaignFilters,
  type EnrollmentFilters,
} from "./useCampaigns";

// DocuSign e-signatures
export {
  useTemplates,
  useEnvelopesForDeal,
  useEnvelopes,
  useEnvelope,
  useCreateEnvelope,
  useVoidEnvelope,
  useEmbeddedSigningUrl,
  useEnvelopePdfUrl,
  signatureKeys,
  type SignatureStatus,
  type SignerStatus,
  type DocumentType,
  type EnvelopeSigner,
  type Envelope,
  type TemplateListItem,
  type TemplateRole,
  type EnvelopeFilters,
  type SignerInput,
  type CreateEnvelopeInput,
  type EmbeddedUrlResponse,
} from "./useSignatures";

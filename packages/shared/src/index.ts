import { z } from "zod";

// ============================================
// Common Types
// ============================================

export type DateRange = {
  start: Date;
  end: Date;
};

export type PaginationParams = {
  page: number;
  limit: number;
};

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
};

// ============================================
// User & Auth Types
// ============================================

export const UserRoleSchema = z.enum([
  "ADMIN",
  "MANAGER",
  "SALES_REP",
  "FINANCE",
  "SERVICE",
]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().nullable(),
  role: UserRoleSchema,
  isActive: z.boolean(),
  dealerId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type User = z.infer<typeof UserSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dealerId: z.string().cuid(),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const AuthResponseSchema = z.object({
  user: UserSchema,
  token: z.string(),
  expiresIn: z.string(),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

// ============================================
// Dealer Types
// ============================================

export const DealerSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  subdomain: z.string().min(1),
  logoUrl: z.string().url().nullable(),
  settings: z.record(z.unknown()),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Dealer = z.infer<typeof DealerSchema>;

// ============================================
// Customer Types
// ============================================

export const CustomerStatusSchema = z.enum([
  "PROSPECT",
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
]);
export type CustomerStatus = z.infer<typeof CustomerStatusSchema>;

export const CustomerSchema = z.object({
  id: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  address: z
    .object({
      street: z.string(),
      city: z.string(),
      state: z.string(),
      zip: z.string(),
      country: z.string().default("USA"),
    })
    .nullable(),
  creditScore: z.number().int().min(300).max(850).nullable(),
  status: CustomerStatusSchema,
  source: z.string().nullable(),
  dealerId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Customer = z.infer<typeof CustomerSchema>;

export const CreateCustomerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z
    .object({
      street: z.string(),
      city: z.string(),
      state: z.string().max(2),
      zip: z.string().regex(/^\d{5}(-\d{4})?$/),
      country: z.string().default("USA"),
    })
    .optional(),
  creditScore: z.number().int().min(300).max(850).optional(),
  source: z.string().optional(),
});
export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;

export const UpdateCustomerSchema = CreateCustomerSchema.partial().extend({
  status: CustomerStatusSchema.optional(),
});
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerSchema>;

// ============================================
// Lead Types
// ============================================

export const LeadStageSchema = z.enum([
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
  "CLOSED_WON",
  "CLOSED_LOST",
]);
export type LeadStage = z.infer<typeof LeadStageSchema>;

export const PrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const LeadSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  stage: LeadStageSchema,
  priority: PrioritySchema,
  notes: z.string().nullable(),
  estimatedValue: z.number().positive().nullable(),
  followUpDate: z.date().nullable(),
  dealerId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Lead = z.infer<typeof LeadSchema>;

export const CreateLeadSchema = z.object({
  customerId: z.string().cuid(),
  stage: LeadStageSchema.default("NEW"),
  priority: PrioritySchema.default("MEDIUM"),
  notes: z.string().optional(),
  estimatedValue: z.number().positive().optional(),
  followUpDate: z.string().datetime().optional(),
});
export type CreateLeadInput = z.infer<typeof CreateLeadSchema>;

export const UpdateLeadSchema = CreateLeadSchema.partial();
export type UpdateLeadInput = z.infer<typeof UpdateLeadSchema>;

// ============================================
// Vehicle Types
// ============================================

export const VehicleConditionSchema = z.enum([
  "NEW",
  "CERTIFIED_PREOWNED",
  "PREOWNED",
]);
export type VehicleCondition = z.infer<typeof VehicleConditionSchema>;

export const VehicleStatusSchema = z.enum([
  "AVAILABLE",
  "RESERVED",
  "SOLD",
  "TRADE_IN",
]);
export type VehicleStatus = z.infer<typeof VehicleStatusSchema>;

export const VehicleSchema = z.object({
  id: z.string(),
  vin: z.string().length(17),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 2),
  make: z.string().min(1),
  model: z.string().min(1),
  trim: z.string().nullable(),
  color: z.string().nullable(),
  mileage: z.number().int().min(0),
  msrp: z.number().positive(),
  salePrice: z.number().positive().nullable(),
  cost: z.number().positive().nullable(),
  condition: VehicleConditionSchema,
  status: VehicleStatusSchema,
  fuelType: z.string().nullable(),
  transmission: z.string().nullable(),
  engine: z.string().nullable(),
  drivetrain: z.string().nullable(),
  images: z.array(z.string().url()),
  features: z.array(z.string()),
  description: z.string().nullable(),
  lotLocation: z.string().nullable(),
  dealerId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Vehicle = z.infer<typeof VehicleSchema>;

export const CreateVehicleSchema = z.object({
  vin: z.string().length(17),
  year: z.number().int().min(1900),
  make: z.string().min(1),
  model: z.string().min(1),
  trim: z.string().optional(),
  color: z.string().optional(),
  mileage: z.number().int().min(0),
  msrp: z.number().positive(),
  salePrice: z.number().positive().optional(),
  cost: z.number().positive().optional(),
  condition: VehicleConditionSchema.default("NEW"),
  fuelType: z.string().optional(),
  transmission: z.string().optional(),
  engine: z.string().optional(),
  drivetrain: z.string().optional(),
  images: z.array(z.string().url()).default([]),
  features: z.array(z.string()).default([]),
  description: z.string().optional(),
  lotLocation: z.string().optional(),
});
export type CreateVehicleInput = z.infer<typeof CreateVehicleSchema>;

export const UpdateVehicleSchema = CreateVehicleSchema.partial().extend({
  status: VehicleStatusSchema.optional(),
});
export type UpdateVehicleInput = z.infer<typeof UpdateVehicleSchema>;

// ============================================
// Deal Types
// ============================================

export const DealStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "FUNDED",
  "COMPLETED",
  "CANCELLED",
]);
export type DealStatus = z.infer<typeof DealStatusSchema>;

export const DealSchema = z.object({
  id: z.string(),
  dealNumber: z.string(),
  customerId: z.string(),
  vehicleId: z.string(),
  salePrice: z.number().positive(),
  tradeInValue: z.number().nonnegative().nullable(),
  downPayment: z.number().nonnegative().nullable(),
  financeAmount: z.number().nonnegative().nullable(),
  apr: z.number().nonnegative().max(30).nullable(),
  termMonths: z.number().int().positive().max(84).nullable(),
  monthlyPayment: z.number().nonnegative().nullable(),
  status: DealStatusSchema,
  financedThrough: z.string().nullable(),
  signedAt: z.date().nullable(),
  dealerId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Deal = z.infer<typeof DealSchema>;

export const CreateDealSchema = z.object({
  customerId: z.string().cuid(),
  vehicleId: z.string().cuid(),
  salePrice: z.number().positive(),
  tradeInValue: z.number().nonnegative().optional(),
  downPayment: z.number().nonnegative().optional(),
  financeAmount: z.number().nonnegative().optional(),
  apr: z.number().nonnegative().max(30).optional(),
  termMonths: z.number().int().positive().max(84).optional(),
  monthlyPayment: z.number().nonnegative().optional(),
  financedThrough: z.string().optional(),
});
export type CreateDealInput = z.infer<typeof CreateDealSchema>;

export const UpdateDealSchema = CreateDealSchema.partial().extend({
  status: DealStatusSchema.optional(),
  signedAt: z.string().datetime().optional(),
});
export type UpdateDealInput = z.infer<typeof UpdateDealSchema>;

// ============================================
// Communication Types
// ============================================

export const CommunicationTypeSchema = z.enum(["EMAIL", "CALL", "SMS", "NOTE"]);
export type CommunicationType = z.infer<typeof CommunicationTypeSchema>;

export const CommunicationDirectionSchema = z.enum(["INBOUND", "OUTBOUND"]);
export type CommunicationDirection = z.infer<
  typeof CommunicationDirectionSchema
>;

export const CreateCommunicationSchema = z.object({
  customerId: z.string().cuid().optional(),
  type: CommunicationTypeSchema,
  direction: CommunicationDirectionSchema,
  subject: z.string().optional(),
  content: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});
export type CreateCommunicationInput = z.infer<
  typeof CreateCommunicationSchema
>;

// ============================================
// Error Response
// ============================================

export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// ============================================
// Vehicle Purchase from Public (AdaptUs DMS Module 2.4)
// ============================================

export const PurchaseSourceSchema = z.enum([
  "WALKIN",
  "PHONE",
  "ONLINE",
  "AUCTION",
  "TRADE_IN",
  "OTHER",
]);
export type PurchaseSource = z.infer<typeof PurchaseSourceSchema>;

export const SellerTypeSchema = z.enum([
  "INDIVIDUAL",
  "COMPANY",
  "DEALER",
  "AUCTION",
]);
export type SellerType = z.infer<typeof SellerTypeSchema>;

export const PurchaseStatusSchema = z.enum([
  "DRAFT",
  "PENDING",
  "COMPLETED",
  "CANCELLED",
]);
export type PurchaseStatus = z.infer<typeof PurchaseStatusSchema>;

export const PurchaseConditionSchema = z.enum([
  "EXCELLENT",
  "GOOD",
  "FAIR",
  "POOR",
  "SALVAGE",
]);
export type PurchaseCondition = z.infer<typeof PurchaseConditionSchema>;

export const PurchaseDocumentTypeSchema = z.enum([
  "BILL_OF_SALE",
  "OWNERSHIP",
  "INSURANCE",
  "INSPECTION",
  "OTHER",
]);
export type PurchaseDocumentType = z.infer<typeof PurchaseDocumentTypeSchema>;

export const SellerAddressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().default("Canada"),
});
export type SellerAddress = z.infer<typeof SellerAddressSchema>;

export const PurchaseDocumentSchema = z.object({
  type: PurchaseDocumentTypeSchema,
  s3Key: z.string().optional(),
  fileName: z.string().optional(),
  uploadedAt: z.string().datetime().optional(),
});
export type PurchaseDocument = z.infer<typeof PurchaseDocumentSchema>;

export const PurchaseChecklistSchema = z.object({
  inspectionComplete: z.boolean().default(false),
  reconditioningNeeded: z.boolean().default(false),
  photosTaken: z.boolean().default(false),
  listed: z.boolean().default(false),
});
export type PurchaseChecklist = z.infer<typeof PurchaseChecklistSchema>;

export const VehiclePurchaseSchema = z.object({
  id: z.string().cuid(),
  dealerId: z.string(),
  vehicleId: z.string().cuid().nullable().optional(),
  vin: z.string().min(11).max(17),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 1),
  make: z.string().min(1),
  model: z.string().min(1),
  trim: z.string().nullable().optional(),
  odometer: z.number().int().nonnegative(),
  exteriorColor: z.string().optional(),
  interiorColor: z.string().optional(),
  condition: PurchaseConditionSchema,
  purchaseDate: z.date(),
  purchasePrice: z.number().nonnegative(),
  source: PurchaseSourceSchema,
  sellerType: SellerTypeSchema,
  sellerName: z.string().min(1),
  sellerPhone: z.string().nullable().optional(),
  sellerEmail: z.string().email().nullable().optional(),
  sellerAddress: SellerAddressSchema.optional(),
  documents: z.array(PurchaseDocumentSchema).optional(),
  notes: z.string().nullable().optional(),
  acceptedById: z.string().nullable().optional(),
  checklist: PurchaseChecklistSchema.optional(),
  status: PurchaseStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type VehiclePurchase = z.infer<typeof VehiclePurchaseSchema>;

export const CreateVehiclePurchaseSchema = z.object({
  vin: z.string().min(11).max(17),
  year: z.coerce.number().int().min(1900).max(new Date().getFullYear() + 1),
  make: z.string().min(1),
  model: z.string().min(1),
  trim: z.string().optional(),
  odometer: z.coerce.number().int().nonnegative(),
  exteriorColor: z.string().optional(),
  interiorColor: z.string().optional(),
  condition: PurchaseConditionSchema,
  purchaseDate: z.coerce.date(),
  purchasePrice: z.coerce.number().nonnegative(),
  source: PurchaseSourceSchema,
  sellerType: SellerTypeSchema,
  sellerName: z.string().min(1),
  sellerPhone: z.string().optional(),
  sellerEmail: z.string().email().optional().or(z.literal("")),
  sellerAddress: SellerAddressSchema.optional(),
  documents: z.array(PurchaseDocumentSchema).optional(),
  notes: z.string().optional(),
  checklist: PurchaseChecklistSchema.optional(),
});
export type CreateVehiclePurchaseInput = z.infer<
  typeof CreateVehiclePurchaseSchema
>;

export const UpdateVehiclePurchaseSchema = CreateVehiclePurchaseSchema.partial().extend({
  status: PurchaseStatusSchema.optional(),
});
export type UpdateVehiclePurchaseInput = z.infer<
  typeof UpdateVehiclePurchaseSchema
>;

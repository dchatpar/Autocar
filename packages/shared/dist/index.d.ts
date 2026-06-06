import { z } from "zod";
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
export declare const UserRoleSchema: z.ZodEnum<["ADMIN", "MANAGER", "SALES_REP", "FINANCE", "SERVICE"]>;
export type UserRole = z.infer<typeof UserRoleSchema>;
export declare const UserSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    firstName: z.ZodString;
    lastName: z.ZodString;
    phone: z.ZodNullable<z.ZodString>;
    role: z.ZodEnum<["ADMIN", "MANAGER", "SALES_REP", "FINANCE", "SERVICE"]>;
    isActive: z.ZodBoolean;
    dealerId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    role: "ADMIN" | "MANAGER" | "SALES_REP" | "FINANCE" | "SERVICE";
    isActive: boolean;
    dealerId: string;
    createdAt: Date;
    updatedAt: Date;
}, {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    role: "ADMIN" | "MANAGER" | "SALES_REP" | "FINANCE" | "SERVICE";
    isActive: boolean;
    dealerId: string;
    createdAt: Date;
    updatedAt: Date;
}>;
export type User = z.infer<typeof UserSchema>;
export declare const LoginRequestSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export declare const RegisterRequestSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    firstName: z.ZodString;
    lastName: z.ZodString;
    dealerId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    firstName: string;
    lastName: string;
    dealerId: string;
    password: string;
}, {
    email: string;
    firstName: string;
    lastName: string;
    dealerId: string;
    password: string;
}>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export declare const AuthResponseSchema: z.ZodObject<{
    user: z.ZodObject<{
        id: z.ZodString;
        email: z.ZodString;
        firstName: z.ZodString;
        lastName: z.ZodString;
        phone: z.ZodNullable<z.ZodString>;
        role: z.ZodEnum<["ADMIN", "MANAGER", "SALES_REP", "FINANCE", "SERVICE"]>;
        isActive: z.ZodBoolean;
        dealerId: z.ZodString;
        createdAt: z.ZodDate;
        updatedAt: z.ZodDate;
    }, "strip", z.ZodTypeAny, {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string | null;
        role: "ADMIN" | "MANAGER" | "SALES_REP" | "FINANCE" | "SERVICE";
        isActive: boolean;
        dealerId: string;
        createdAt: Date;
        updatedAt: Date;
    }, {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string | null;
        role: "ADMIN" | "MANAGER" | "SALES_REP" | "FINANCE" | "SERVICE";
        isActive: boolean;
        dealerId: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    token: z.ZodString;
    expiresIn: z.ZodString;
}, "strip", z.ZodTypeAny, {
    user: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string | null;
        role: "ADMIN" | "MANAGER" | "SALES_REP" | "FINANCE" | "SERVICE";
        isActive: boolean;
        dealerId: string;
        createdAt: Date;
        updatedAt: Date;
    };
    token: string;
    expiresIn: string;
}, {
    user: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string | null;
        role: "ADMIN" | "MANAGER" | "SALES_REP" | "FINANCE" | "SERVICE";
        isActive: boolean;
        dealerId: string;
        createdAt: Date;
        updatedAt: Date;
    };
    token: string;
    expiresIn: string;
}>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export declare const DealerSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    subdomain: z.ZodString;
    logoUrl: z.ZodNullable<z.ZodString>;
    settings: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    subdomain: string;
    logoUrl: string | null;
    settings: Record<string, unknown>;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    subdomain: string;
    logoUrl: string | null;
    settings: Record<string, unknown>;
}>;
export type Dealer = z.infer<typeof DealerSchema>;
export declare const CustomerStatusSchema: z.ZodEnum<["PROSPECT", "ACTIVE", "INACTIVE", "ARCHIVED"]>;
export type CustomerStatus = z.infer<typeof CustomerStatusSchema>;
export declare const CustomerSchema: z.ZodObject<{
    id: z.ZodString;
    firstName: z.ZodString;
    lastName: z.ZodString;
    email: z.ZodNullable<z.ZodString>;
    phone: z.ZodNullable<z.ZodString>;
    address: z.ZodNullable<z.ZodObject<{
        street: z.ZodString;
        city: z.ZodString;
        state: z.ZodString;
        zip: z.ZodString;
        country: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
    }, {
        street: string;
        city: string;
        state: string;
        zip: string;
        country?: string | undefined;
    }>>;
    creditScore: z.ZodNullable<z.ZodNumber>;
    status: z.ZodEnum<["PROSPECT", "ACTIVE", "INACTIVE", "ARCHIVED"]>;
    source: z.ZodNullable<z.ZodString>;
    dealerId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    status: "PROSPECT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
    id: string;
    email: string | null;
    firstName: string;
    lastName: string;
    phone: string | null;
    dealerId: string;
    createdAt: Date;
    updatedAt: Date;
    address: {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
    } | null;
    creditScore: number | null;
    source: string | null;
}, {
    status: "PROSPECT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
    id: string;
    email: string | null;
    firstName: string;
    lastName: string;
    phone: string | null;
    dealerId: string;
    createdAt: Date;
    updatedAt: Date;
    address: {
        street: string;
        city: string;
        state: string;
        zip: string;
        country?: string | undefined;
    } | null;
    creditScore: number | null;
    source: string | null;
}>;
export type Customer = z.infer<typeof CustomerSchema>;
export declare const CreateCustomerSchema: z.ZodObject<{
    firstName: z.ZodString;
    lastName: z.ZodString;
    email: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodObject<{
        street: z.ZodString;
        city: z.ZodString;
        state: z.ZodString;
        zip: z.ZodString;
        country: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
    }, {
        street: string;
        city: string;
        state: string;
        zip: string;
        country?: string | undefined;
    }>>;
    creditScore: z.ZodOptional<z.ZodNumber>;
    source: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    firstName: string;
    lastName: string;
    email?: string | undefined;
    phone?: string | undefined;
    address?: {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
    } | undefined;
    creditScore?: number | undefined;
    source?: string | undefined;
}, {
    firstName: string;
    lastName: string;
    email?: string | undefined;
    phone?: string | undefined;
    address?: {
        street: string;
        city: string;
        state: string;
        zip: string;
        country?: string | undefined;
    } | undefined;
    creditScore?: number | undefined;
    source?: string | undefined;
}>;
export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;
export declare const UpdateCustomerSchema: z.ZodObject<{
    firstName: z.ZodOptional<z.ZodString>;
    lastName: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    phone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    address: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        street: z.ZodString;
        city: z.ZodString;
        state: z.ZodString;
        zip: z.ZodString;
        country: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
    }, {
        street: string;
        city: string;
        state: string;
        zip: string;
        country?: string | undefined;
    }>>>;
    creditScore: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    source: z.ZodOptional<z.ZodOptional<z.ZodString>>;
} & {
    status: z.ZodOptional<z.ZodEnum<["PROSPECT", "ACTIVE", "INACTIVE", "ARCHIVED"]>>;
}, "strip", z.ZodTypeAny, {
    status?: "PROSPECT" | "ACTIVE" | "INACTIVE" | "ARCHIVED" | undefined;
    email?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    phone?: string | undefined;
    address?: {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
    } | undefined;
    creditScore?: number | undefined;
    source?: string | undefined;
}, {
    status?: "PROSPECT" | "ACTIVE" | "INACTIVE" | "ARCHIVED" | undefined;
    email?: string | undefined;
    firstName?: string | undefined;
    lastName?: string | undefined;
    phone?: string | undefined;
    address?: {
        street: string;
        city: string;
        state: string;
        zip: string;
        country?: string | undefined;
    } | undefined;
    creditScore?: number | undefined;
    source?: string | undefined;
}>;
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerSchema>;
export declare const LeadStageSchema: z.ZodEnum<["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"]>;
export type LeadStage = z.infer<typeof LeadStageSchema>;
export declare const PrioritySchema: z.ZodEnum<["LOW", "MEDIUM", "HIGH", "URGENT"]>;
export type Priority = z.infer<typeof PrioritySchema>;
export declare const LeadSchema: z.ZodObject<{
    id: z.ZodString;
    customerId: z.ZodString;
    stage: z.ZodEnum<["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"]>;
    priority: z.ZodEnum<["LOW", "MEDIUM", "HIGH", "URGENT"]>;
    notes: z.ZodNullable<z.ZodString>;
    estimatedValue: z.ZodNullable<z.ZodNumber>;
    followUpDate: z.ZodNullable<z.ZodDate>;
    dealerId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    dealerId: string;
    createdAt: Date;
    updatedAt: Date;
    customerId: string;
    stage: "NEW" | "CONTACTED" | "QUALIFIED" | "PROPOSAL" | "NEGOTIATION" | "CLOSED_WON" | "CLOSED_LOST";
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    notes: string | null;
    estimatedValue: number | null;
    followUpDate: Date | null;
}, {
    id: string;
    dealerId: string;
    createdAt: Date;
    updatedAt: Date;
    customerId: string;
    stage: "NEW" | "CONTACTED" | "QUALIFIED" | "PROPOSAL" | "NEGOTIATION" | "CLOSED_WON" | "CLOSED_LOST";
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    notes: string | null;
    estimatedValue: number | null;
    followUpDate: Date | null;
}>;
export type Lead = z.infer<typeof LeadSchema>;
export declare const CreateLeadSchema: z.ZodObject<{
    customerId: z.ZodString;
    stage: z.ZodDefault<z.ZodEnum<["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"]>>;
    priority: z.ZodDefault<z.ZodEnum<["LOW", "MEDIUM", "HIGH", "URGENT"]>>;
    notes: z.ZodOptional<z.ZodString>;
    estimatedValue: z.ZodOptional<z.ZodNumber>;
    followUpDate: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    customerId: string;
    stage: "NEW" | "CONTACTED" | "QUALIFIED" | "PROPOSAL" | "NEGOTIATION" | "CLOSED_WON" | "CLOSED_LOST";
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    notes?: string | undefined;
    estimatedValue?: number | undefined;
    followUpDate?: string | undefined;
}, {
    customerId: string;
    stage?: "NEW" | "CONTACTED" | "QUALIFIED" | "PROPOSAL" | "NEGOTIATION" | "CLOSED_WON" | "CLOSED_LOST" | undefined;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT" | undefined;
    notes?: string | undefined;
    estimatedValue?: number | undefined;
    followUpDate?: string | undefined;
}>;
export type CreateLeadInput = z.infer<typeof CreateLeadSchema>;
export declare const UpdateLeadSchema: z.ZodObject<{
    customerId: z.ZodOptional<z.ZodString>;
    stage: z.ZodOptional<z.ZodDefault<z.ZodEnum<["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"]>>>;
    priority: z.ZodOptional<z.ZodDefault<z.ZodEnum<["LOW", "MEDIUM", "HIGH", "URGENT"]>>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    estimatedValue: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    followUpDate: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    customerId?: string | undefined;
    stage?: "NEW" | "CONTACTED" | "QUALIFIED" | "PROPOSAL" | "NEGOTIATION" | "CLOSED_WON" | "CLOSED_LOST" | undefined;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT" | undefined;
    notes?: string | undefined;
    estimatedValue?: number | undefined;
    followUpDate?: string | undefined;
}, {
    customerId?: string | undefined;
    stage?: "NEW" | "CONTACTED" | "QUALIFIED" | "PROPOSAL" | "NEGOTIATION" | "CLOSED_WON" | "CLOSED_LOST" | undefined;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT" | undefined;
    notes?: string | undefined;
    estimatedValue?: number | undefined;
    followUpDate?: string | undefined;
}>;
export type UpdateLeadInput = z.infer<typeof UpdateLeadSchema>;
export declare const VehicleConditionSchema: z.ZodEnum<["NEW", "CERTIFIED_PREOWNED", "PREOWNED"]>;
export type VehicleCondition = z.infer<typeof VehicleConditionSchema>;
export declare const VehicleStatusSchema: z.ZodEnum<["AVAILABLE", "RESERVED", "SOLD", "TRADE_IN"]>;
export type VehicleStatus = z.infer<typeof VehicleStatusSchema>;
export declare const VehicleSchema: z.ZodObject<{
    id: z.ZodString;
    vin: z.ZodString;
    year: z.ZodNumber;
    make: z.ZodString;
    model: z.ZodString;
    trim: z.ZodNullable<z.ZodString>;
    color: z.ZodNullable<z.ZodString>;
    mileage: z.ZodNumber;
    msrp: z.ZodNumber;
    salePrice: z.ZodNullable<z.ZodNumber>;
    cost: z.ZodNullable<z.ZodNumber>;
    condition: z.ZodEnum<["NEW", "CERTIFIED_PREOWNED", "PREOWNED"]>;
    status: z.ZodEnum<["AVAILABLE", "RESERVED", "SOLD", "TRADE_IN"]>;
    fuelType: z.ZodNullable<z.ZodString>;
    transmission: z.ZodNullable<z.ZodString>;
    engine: z.ZodNullable<z.ZodString>;
    drivetrain: z.ZodNullable<z.ZodString>;
    images: z.ZodArray<z.ZodString, "many">;
    features: z.ZodArray<z.ZodString, "many">;
    description: z.ZodNullable<z.ZodString>;
    lotLocation: z.ZodNullable<z.ZodString>;
    dealerId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    status: "AVAILABLE" | "RESERVED" | "SOLD" | "TRADE_IN";
    id: string;
    dealerId: string;
    createdAt: Date;
    updatedAt: Date;
    vin: string;
    year: number;
    make: string;
    model: string;
    trim: string | null;
    color: string | null;
    mileage: number;
    msrp: number;
    salePrice: number | null;
    cost: number | null;
    condition: "NEW" | "CERTIFIED_PREOWNED" | "PREOWNED";
    fuelType: string | null;
    transmission: string | null;
    engine: string | null;
    drivetrain: string | null;
    images: string[];
    features: string[];
    description: string | null;
    lotLocation: string | null;
}, {
    status: "AVAILABLE" | "RESERVED" | "SOLD" | "TRADE_IN";
    id: string;
    dealerId: string;
    createdAt: Date;
    updatedAt: Date;
    vin: string;
    year: number;
    make: string;
    model: string;
    trim: string | null;
    color: string | null;
    mileage: number;
    msrp: number;
    salePrice: number | null;
    cost: number | null;
    condition: "NEW" | "CERTIFIED_PREOWNED" | "PREOWNED";
    fuelType: string | null;
    transmission: string | null;
    engine: string | null;
    drivetrain: string | null;
    images: string[];
    features: string[];
    description: string | null;
    lotLocation: string | null;
}>;
export type Vehicle = z.infer<typeof VehicleSchema>;
export declare const CreateVehicleSchema: z.ZodObject<{
    vin: z.ZodString;
    year: z.ZodNumber;
    make: z.ZodString;
    model: z.ZodString;
    trim: z.ZodOptional<z.ZodString>;
    color: z.ZodOptional<z.ZodString>;
    mileage: z.ZodNumber;
    msrp: z.ZodNumber;
    salePrice: z.ZodOptional<z.ZodNumber>;
    cost: z.ZodOptional<z.ZodNumber>;
    condition: z.ZodDefault<z.ZodEnum<["NEW", "CERTIFIED_PREOWNED", "PREOWNED"]>>;
    fuelType: z.ZodOptional<z.ZodString>;
    transmission: z.ZodOptional<z.ZodString>;
    engine: z.ZodOptional<z.ZodString>;
    drivetrain: z.ZodOptional<z.ZodString>;
    images: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    features: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    description: z.ZodOptional<z.ZodString>;
    lotLocation: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    vin: string;
    year: number;
    make: string;
    model: string;
    mileage: number;
    msrp: number;
    condition: "NEW" | "CERTIFIED_PREOWNED" | "PREOWNED";
    images: string[];
    features: string[];
    trim?: string | undefined;
    color?: string | undefined;
    salePrice?: number | undefined;
    cost?: number | undefined;
    fuelType?: string | undefined;
    transmission?: string | undefined;
    engine?: string | undefined;
    drivetrain?: string | undefined;
    description?: string | undefined;
    lotLocation?: string | undefined;
}, {
    vin: string;
    year: number;
    make: string;
    model: string;
    mileage: number;
    msrp: number;
    trim?: string | undefined;
    color?: string | undefined;
    salePrice?: number | undefined;
    cost?: number | undefined;
    condition?: "NEW" | "CERTIFIED_PREOWNED" | "PREOWNED" | undefined;
    fuelType?: string | undefined;
    transmission?: string | undefined;
    engine?: string | undefined;
    drivetrain?: string | undefined;
    images?: string[] | undefined;
    features?: string[] | undefined;
    description?: string | undefined;
    lotLocation?: string | undefined;
}>;
export type CreateVehicleInput = z.infer<typeof CreateVehicleSchema>;
export declare const UpdateVehicleSchema: z.ZodObject<{
    vin: z.ZodOptional<z.ZodString>;
    year: z.ZodOptional<z.ZodNumber>;
    make: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    trim: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    color: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    mileage: z.ZodOptional<z.ZodNumber>;
    msrp: z.ZodOptional<z.ZodNumber>;
    salePrice: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    cost: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    condition: z.ZodOptional<z.ZodDefault<z.ZodEnum<["NEW", "CERTIFIED_PREOWNED", "PREOWNED"]>>>;
    fuelType: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    transmission: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    engine: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    drivetrain: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    images: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodString, "many">>>;
    features: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodString, "many">>>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    lotLocation: z.ZodOptional<z.ZodOptional<z.ZodString>>;
} & {
    status: z.ZodOptional<z.ZodEnum<["AVAILABLE", "RESERVED", "SOLD", "TRADE_IN"]>>;
}, "strip", z.ZodTypeAny, {
    status?: "AVAILABLE" | "RESERVED" | "SOLD" | "TRADE_IN" | undefined;
    vin?: string | undefined;
    year?: number | undefined;
    make?: string | undefined;
    model?: string | undefined;
    trim?: string | undefined;
    color?: string | undefined;
    mileage?: number | undefined;
    msrp?: number | undefined;
    salePrice?: number | undefined;
    cost?: number | undefined;
    condition?: "NEW" | "CERTIFIED_PREOWNED" | "PREOWNED" | undefined;
    fuelType?: string | undefined;
    transmission?: string | undefined;
    engine?: string | undefined;
    drivetrain?: string | undefined;
    images?: string[] | undefined;
    features?: string[] | undefined;
    description?: string | undefined;
    lotLocation?: string | undefined;
}, {
    status?: "AVAILABLE" | "RESERVED" | "SOLD" | "TRADE_IN" | undefined;
    vin?: string | undefined;
    year?: number | undefined;
    make?: string | undefined;
    model?: string | undefined;
    trim?: string | undefined;
    color?: string | undefined;
    mileage?: number | undefined;
    msrp?: number | undefined;
    salePrice?: number | undefined;
    cost?: number | undefined;
    condition?: "NEW" | "CERTIFIED_PREOWNED" | "PREOWNED" | undefined;
    fuelType?: string | undefined;
    transmission?: string | undefined;
    engine?: string | undefined;
    drivetrain?: string | undefined;
    images?: string[] | undefined;
    features?: string[] | undefined;
    description?: string | undefined;
    lotLocation?: string | undefined;
}>;
export type UpdateVehicleInput = z.infer<typeof UpdateVehicleSchema>;
export declare const DealStatusSchema: z.ZodEnum<["PENDING", "APPROVED", "FUNDED", "COMPLETED", "CANCELLED"]>;
export type DealStatus = z.infer<typeof DealStatusSchema>;
export declare const DealSchema: z.ZodObject<{
    id: z.ZodString;
    dealNumber: z.ZodString;
    customerId: z.ZodString;
    vehicleId: z.ZodString;
    salePrice: z.ZodNumber;
    tradeInValue: z.ZodNullable<z.ZodNumber>;
    downPayment: z.ZodNullable<z.ZodNumber>;
    financeAmount: z.ZodNullable<z.ZodNumber>;
    apr: z.ZodNullable<z.ZodNumber>;
    termMonths: z.ZodNullable<z.ZodNumber>;
    monthlyPayment: z.ZodNullable<z.ZodNumber>;
    status: z.ZodEnum<["PENDING", "APPROVED", "FUNDED", "COMPLETED", "CANCELLED"]>;
    financedThrough: z.ZodNullable<z.ZodString>;
    signedAt: z.ZodNullable<z.ZodDate>;
    dealerId: z.ZodString;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    status: "PENDING" | "APPROVED" | "FUNDED" | "COMPLETED" | "CANCELLED";
    id: string;
    dealerId: string;
    createdAt: Date;
    updatedAt: Date;
    customerId: string;
    salePrice: number;
    dealNumber: string;
    vehicleId: string;
    tradeInValue: number | null;
    downPayment: number | null;
    financeAmount: number | null;
    apr: number | null;
    termMonths: number | null;
    monthlyPayment: number | null;
    financedThrough: string | null;
    signedAt: Date | null;
}, {
    status: "PENDING" | "APPROVED" | "FUNDED" | "COMPLETED" | "CANCELLED";
    id: string;
    dealerId: string;
    createdAt: Date;
    updatedAt: Date;
    customerId: string;
    salePrice: number;
    dealNumber: string;
    vehicleId: string;
    tradeInValue: number | null;
    downPayment: number | null;
    financeAmount: number | null;
    apr: number | null;
    termMonths: number | null;
    monthlyPayment: number | null;
    financedThrough: string | null;
    signedAt: Date | null;
}>;
export type Deal = z.infer<typeof DealSchema>;
export declare const CreateDealSchema: z.ZodObject<{
    customerId: z.ZodString;
    vehicleId: z.ZodString;
    salePrice: z.ZodNumber;
    tradeInValue: z.ZodOptional<z.ZodNumber>;
    downPayment: z.ZodOptional<z.ZodNumber>;
    financeAmount: z.ZodOptional<z.ZodNumber>;
    apr: z.ZodOptional<z.ZodNumber>;
    termMonths: z.ZodOptional<z.ZodNumber>;
    monthlyPayment: z.ZodOptional<z.ZodNumber>;
    financedThrough: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    customerId: string;
    salePrice: number;
    vehicleId: string;
    tradeInValue?: number | undefined;
    downPayment?: number | undefined;
    financeAmount?: number | undefined;
    apr?: number | undefined;
    termMonths?: number | undefined;
    monthlyPayment?: number | undefined;
    financedThrough?: string | undefined;
}, {
    customerId: string;
    salePrice: number;
    vehicleId: string;
    tradeInValue?: number | undefined;
    downPayment?: number | undefined;
    financeAmount?: number | undefined;
    apr?: number | undefined;
    termMonths?: number | undefined;
    monthlyPayment?: number | undefined;
    financedThrough?: string | undefined;
}>;
export type CreateDealInput = z.infer<typeof CreateDealSchema>;
export declare const UpdateDealSchema: z.ZodObject<{
    customerId: z.ZodOptional<z.ZodString>;
    vehicleId: z.ZodOptional<z.ZodString>;
    salePrice: z.ZodOptional<z.ZodNumber>;
    tradeInValue: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    downPayment: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    financeAmount: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    apr: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    termMonths: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    monthlyPayment: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    financedThrough: z.ZodOptional<z.ZodOptional<z.ZodString>>;
} & {
    status: z.ZodOptional<z.ZodEnum<["PENDING", "APPROVED", "FUNDED", "COMPLETED", "CANCELLED"]>>;
    signedAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status?: "PENDING" | "APPROVED" | "FUNDED" | "COMPLETED" | "CANCELLED" | undefined;
    customerId?: string | undefined;
    salePrice?: number | undefined;
    vehicleId?: string | undefined;
    tradeInValue?: number | undefined;
    downPayment?: number | undefined;
    financeAmount?: number | undefined;
    apr?: number | undefined;
    termMonths?: number | undefined;
    monthlyPayment?: number | undefined;
    financedThrough?: string | undefined;
    signedAt?: string | undefined;
}, {
    status?: "PENDING" | "APPROVED" | "FUNDED" | "COMPLETED" | "CANCELLED" | undefined;
    customerId?: string | undefined;
    salePrice?: number | undefined;
    vehicleId?: string | undefined;
    tradeInValue?: number | undefined;
    downPayment?: number | undefined;
    financeAmount?: number | undefined;
    apr?: number | undefined;
    termMonths?: number | undefined;
    monthlyPayment?: number | undefined;
    financedThrough?: string | undefined;
    signedAt?: string | undefined;
}>;
export type UpdateDealInput = z.infer<typeof UpdateDealSchema>;
export declare const CommunicationTypeSchema: z.ZodEnum<["EMAIL", "CALL", "SMS", "NOTE"]>;
export type CommunicationType = z.infer<typeof CommunicationTypeSchema>;
export declare const CommunicationDirectionSchema: z.ZodEnum<["INBOUND", "OUTBOUND"]>;
export type CommunicationDirection = z.infer<typeof CommunicationDirectionSchema>;
export declare const CreateCommunicationSchema: z.ZodObject<{
    customerId: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<["EMAIL", "CALL", "SMS", "NOTE"]>;
    direction: z.ZodEnum<["INBOUND", "OUTBOUND"]>;
    subject: z.ZodOptional<z.ZodString>;
    content: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    type: "EMAIL" | "CALL" | "SMS" | "NOTE";
    direction: "INBOUND" | "OUTBOUND";
    content: string;
    customerId?: string | undefined;
    subject?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    type: "EMAIL" | "CALL" | "SMS" | "NOTE";
    direction: "INBOUND" | "OUTBOUND";
    content: string;
    customerId?: string | undefined;
    subject?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export type CreateCommunicationInput = z.infer<typeof CreateCommunicationSchema>;
export declare const ErrorResponseSchema: z.ZodObject<{
    error: z.ZodString;
    code: z.ZodOptional<z.ZodString>;
    details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    error: string;
    code?: string | undefined;
    details?: Record<string, unknown> | undefined;
}, {
    error: string;
    code?: string | undefined;
    details?: Record<string, unknown> | undefined;
}>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export declare const PurchaseSourceSchema: z.ZodEnum<["WALKIN", "PHONE", "ONLINE", "AUCTION", "TRADE_IN", "OTHER"]>;
export type PurchaseSource = z.infer<typeof PurchaseSourceSchema>;
export declare const SellerTypeSchema: z.ZodEnum<["INDIVIDUAL", "COMPANY", "DEALER", "AUCTION"]>;
export type SellerType = z.infer<typeof SellerTypeSchema>;
export declare const PurchaseStatusSchema: z.ZodEnum<["DRAFT", "PENDING", "COMPLETED", "CANCELLED"]>;
export type PurchaseStatus = z.infer<typeof PurchaseStatusSchema>;
export declare const PurchaseConditionSchema: z.ZodEnum<["EXCELLENT", "GOOD", "FAIR", "POOR", "SALVAGE"]>;
export type PurchaseCondition = z.infer<typeof PurchaseConditionSchema>;
export declare const PurchaseDocumentTypeSchema: z.ZodEnum<["BILL_OF_SALE", "OWNERSHIP", "INSURANCE", "INSPECTION", "OTHER"]>;
export type PurchaseDocumentType = z.infer<typeof PurchaseDocumentTypeSchema>;
export declare const SellerAddressSchema: z.ZodObject<{
    street: z.ZodOptional<z.ZodString>;
    city: z.ZodOptional<z.ZodString>;
    province: z.ZodOptional<z.ZodString>;
    postalCode: z.ZodOptional<z.ZodString>;
    country: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    country: string;
    street?: string | undefined;
    city?: string | undefined;
    province?: string | undefined;
    postalCode?: string | undefined;
}, {
    street?: string | undefined;
    city?: string | undefined;
    country?: string | undefined;
    province?: string | undefined;
    postalCode?: string | undefined;
}>;
export type SellerAddress = z.infer<typeof SellerAddressSchema>;
export declare const PurchaseDocumentSchema: z.ZodObject<{
    type: z.ZodEnum<["BILL_OF_SALE", "OWNERSHIP", "INSURANCE", "INSPECTION", "OTHER"]>;
    s3Key: z.ZodOptional<z.ZodString>;
    fileName: z.ZodOptional<z.ZodString>;
    uploadedAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "OTHER" | "BILL_OF_SALE" | "OWNERSHIP" | "INSURANCE" | "INSPECTION";
    s3Key?: string | undefined;
    fileName?: string | undefined;
    uploadedAt?: string | undefined;
}, {
    type: "OTHER" | "BILL_OF_SALE" | "OWNERSHIP" | "INSURANCE" | "INSPECTION";
    s3Key?: string | undefined;
    fileName?: string | undefined;
    uploadedAt?: string | undefined;
}>;
export type PurchaseDocument = z.infer<typeof PurchaseDocumentSchema>;
export declare const PurchaseChecklistSchema: z.ZodObject<{
    inspectionComplete: z.ZodDefault<z.ZodBoolean>;
    reconditioningNeeded: z.ZodDefault<z.ZodBoolean>;
    photosTaken: z.ZodDefault<z.ZodBoolean>;
    listed: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    inspectionComplete: boolean;
    reconditioningNeeded: boolean;
    photosTaken: boolean;
    listed: boolean;
}, {
    inspectionComplete?: boolean | undefined;
    reconditioningNeeded?: boolean | undefined;
    photosTaken?: boolean | undefined;
    listed?: boolean | undefined;
}>;
export type PurchaseChecklist = z.infer<typeof PurchaseChecklistSchema>;
export declare const VehiclePurchaseSchema: z.ZodObject<{
    id: z.ZodString;
    dealerId: z.ZodString;
    vehicleId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    vin: z.ZodString;
    year: z.ZodNumber;
    make: z.ZodString;
    model: z.ZodString;
    trim: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    odometer: z.ZodNumber;
    exteriorColor: z.ZodOptional<z.ZodString>;
    interiorColor: z.ZodOptional<z.ZodString>;
    condition: z.ZodEnum<["EXCELLENT", "GOOD", "FAIR", "POOR", "SALVAGE"]>;
    purchaseDate: z.ZodDate;
    purchasePrice: z.ZodNumber;
    source: z.ZodEnum<["WALKIN", "PHONE", "ONLINE", "AUCTION", "TRADE_IN", "OTHER"]>;
    sellerType: z.ZodEnum<["INDIVIDUAL", "COMPANY", "DEALER", "AUCTION"]>;
    sellerName: z.ZodString;
    sellerPhone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sellerEmail: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sellerAddress: z.ZodOptional<z.ZodObject<{
        street: z.ZodOptional<z.ZodString>;
        city: z.ZodOptional<z.ZodString>;
        province: z.ZodOptional<z.ZodString>;
        postalCode: z.ZodOptional<z.ZodString>;
        country: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        country: string;
        street?: string | undefined;
        city?: string | undefined;
        province?: string | undefined;
        postalCode?: string | undefined;
    }, {
        street?: string | undefined;
        city?: string | undefined;
        country?: string | undefined;
        province?: string | undefined;
        postalCode?: string | undefined;
    }>>;
    documents: z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["BILL_OF_SALE", "OWNERSHIP", "INSURANCE", "INSPECTION", "OTHER"]>;
        s3Key: z.ZodOptional<z.ZodString>;
        fileName: z.ZodOptional<z.ZodString>;
        uploadedAt: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "OTHER" | "BILL_OF_SALE" | "OWNERSHIP" | "INSURANCE" | "INSPECTION";
        s3Key?: string | undefined;
        fileName?: string | undefined;
        uploadedAt?: string | undefined;
    }, {
        type: "OTHER" | "BILL_OF_SALE" | "OWNERSHIP" | "INSURANCE" | "INSPECTION";
        s3Key?: string | undefined;
        fileName?: string | undefined;
        uploadedAt?: string | undefined;
    }>, "many">>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    acceptedById: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    checklist: z.ZodOptional<z.ZodObject<{
        inspectionComplete: z.ZodDefault<z.ZodBoolean>;
        reconditioningNeeded: z.ZodDefault<z.ZodBoolean>;
        photosTaken: z.ZodDefault<z.ZodBoolean>;
        listed: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        inspectionComplete: boolean;
        reconditioningNeeded: boolean;
        photosTaken: boolean;
        listed: boolean;
    }, {
        inspectionComplete?: boolean | undefined;
        reconditioningNeeded?: boolean | undefined;
        photosTaken?: boolean | undefined;
        listed?: boolean | undefined;
    }>>;
    status: z.ZodEnum<["DRAFT", "PENDING", "COMPLETED", "CANCELLED"]>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    status: "PENDING" | "COMPLETED" | "CANCELLED" | "DRAFT";
    id: string;
    dealerId: string;
    createdAt: Date;
    updatedAt: Date;
    source: "TRADE_IN" | "WALKIN" | "PHONE" | "ONLINE" | "AUCTION" | "OTHER";
    vin: string;
    year: number;
    make: string;
    model: string;
    condition: "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "SALVAGE";
    odometer: number;
    purchaseDate: Date;
    purchasePrice: number;
    sellerType: "AUCTION" | "INDIVIDUAL" | "COMPANY" | "DEALER";
    sellerName: string;
    notes?: string | null | undefined;
    trim?: string | null | undefined;
    vehicleId?: string | null | undefined;
    exteriorColor?: string | undefined;
    interiorColor?: string | undefined;
    sellerPhone?: string | null | undefined;
    sellerEmail?: string | null | undefined;
    sellerAddress?: {
        country: string;
        street?: string | undefined;
        city?: string | undefined;
        province?: string | undefined;
        postalCode?: string | undefined;
    } | undefined;
    documents?: {
        type: "OTHER" | "BILL_OF_SALE" | "OWNERSHIP" | "INSURANCE" | "INSPECTION";
        s3Key?: string | undefined;
        fileName?: string | undefined;
        uploadedAt?: string | undefined;
    }[] | undefined;
    acceptedById?: string | null | undefined;
    checklist?: {
        inspectionComplete: boolean;
        reconditioningNeeded: boolean;
        photosTaken: boolean;
        listed: boolean;
    } | undefined;
}, {
    status: "PENDING" | "COMPLETED" | "CANCELLED" | "DRAFT";
    id: string;
    dealerId: string;
    createdAt: Date;
    updatedAt: Date;
    source: "TRADE_IN" | "WALKIN" | "PHONE" | "ONLINE" | "AUCTION" | "OTHER";
    vin: string;
    year: number;
    make: string;
    model: string;
    condition: "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "SALVAGE";
    odometer: number;
    purchaseDate: Date;
    purchasePrice: number;
    sellerType: "AUCTION" | "INDIVIDUAL" | "COMPANY" | "DEALER";
    sellerName: string;
    notes?: string | null | undefined;
    trim?: string | null | undefined;
    vehicleId?: string | null | undefined;
    exteriorColor?: string | undefined;
    interiorColor?: string | undefined;
    sellerPhone?: string | null | undefined;
    sellerEmail?: string | null | undefined;
    sellerAddress?: {
        street?: string | undefined;
        city?: string | undefined;
        country?: string | undefined;
        province?: string | undefined;
        postalCode?: string | undefined;
    } | undefined;
    documents?: {
        type: "OTHER" | "BILL_OF_SALE" | "OWNERSHIP" | "INSURANCE" | "INSPECTION";
        s3Key?: string | undefined;
        fileName?: string | undefined;
        uploadedAt?: string | undefined;
    }[] | undefined;
    acceptedById?: string | null | undefined;
    checklist?: {
        inspectionComplete?: boolean | undefined;
        reconditioningNeeded?: boolean | undefined;
        photosTaken?: boolean | undefined;
        listed?: boolean | undefined;
    } | undefined;
}>;
export type VehiclePurchase = z.infer<typeof VehiclePurchaseSchema>;
export declare const CreateVehiclePurchaseSchema: z.ZodObject<{
    vin: z.ZodString;
    year: z.ZodNumber;
    make: z.ZodString;
    model: z.ZodString;
    trim: z.ZodOptional<z.ZodString>;
    odometer: z.ZodNumber;
    exteriorColor: z.ZodOptional<z.ZodString>;
    interiorColor: z.ZodOptional<z.ZodString>;
    condition: z.ZodEnum<["EXCELLENT", "GOOD", "FAIR", "POOR", "SALVAGE"]>;
    purchaseDate: z.ZodDate;
    purchasePrice: z.ZodNumber;
    source: z.ZodEnum<["WALKIN", "PHONE", "ONLINE", "AUCTION", "TRADE_IN", "OTHER"]>;
    sellerType: z.ZodEnum<["INDIVIDUAL", "COMPANY", "DEALER", "AUCTION"]>;
    sellerName: z.ZodString;
    sellerPhone: z.ZodOptional<z.ZodString>;
    sellerEmail: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    sellerAddress: z.ZodOptional<z.ZodObject<{
        street: z.ZodOptional<z.ZodString>;
        city: z.ZodOptional<z.ZodString>;
        province: z.ZodOptional<z.ZodString>;
        postalCode: z.ZodOptional<z.ZodString>;
        country: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        country: string;
        street?: string | undefined;
        city?: string | undefined;
        province?: string | undefined;
        postalCode?: string | undefined;
    }, {
        street?: string | undefined;
        city?: string | undefined;
        country?: string | undefined;
        province?: string | undefined;
        postalCode?: string | undefined;
    }>>;
    documents: z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["BILL_OF_SALE", "OWNERSHIP", "INSURANCE", "INSPECTION", "OTHER"]>;
        s3Key: z.ZodOptional<z.ZodString>;
        fileName: z.ZodOptional<z.ZodString>;
        uploadedAt: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "OTHER" | "BILL_OF_SALE" | "OWNERSHIP" | "INSURANCE" | "INSPECTION";
        s3Key?: string | undefined;
        fileName?: string | undefined;
        uploadedAt?: string | undefined;
    }, {
        type: "OTHER" | "BILL_OF_SALE" | "OWNERSHIP" | "INSURANCE" | "INSPECTION";
        s3Key?: string | undefined;
        fileName?: string | undefined;
        uploadedAt?: string | undefined;
    }>, "many">>;
    notes: z.ZodOptional<z.ZodString>;
    checklist: z.ZodOptional<z.ZodObject<{
        inspectionComplete: z.ZodDefault<z.ZodBoolean>;
        reconditioningNeeded: z.ZodDefault<z.ZodBoolean>;
        photosTaken: z.ZodDefault<z.ZodBoolean>;
        listed: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        inspectionComplete: boolean;
        reconditioningNeeded: boolean;
        photosTaken: boolean;
        listed: boolean;
    }, {
        inspectionComplete?: boolean | undefined;
        reconditioningNeeded?: boolean | undefined;
        photosTaken?: boolean | undefined;
        listed?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    source: "TRADE_IN" | "WALKIN" | "PHONE" | "ONLINE" | "AUCTION" | "OTHER";
    vin: string;
    year: number;
    make: string;
    model: string;
    condition: "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "SALVAGE";
    odometer: number;
    purchaseDate: Date;
    purchasePrice: number;
    sellerType: "AUCTION" | "INDIVIDUAL" | "COMPANY" | "DEALER";
    sellerName: string;
    notes?: string | undefined;
    trim?: string | undefined;
    exteriorColor?: string | undefined;
    interiorColor?: string | undefined;
    sellerPhone?: string | undefined;
    sellerEmail?: string | undefined;
    sellerAddress?: {
        country: string;
        street?: string | undefined;
        city?: string | undefined;
        province?: string | undefined;
        postalCode?: string | undefined;
    } | undefined;
    documents?: {
        type: "OTHER" | "BILL_OF_SALE" | "OWNERSHIP" | "INSURANCE" | "INSPECTION";
        s3Key?: string | undefined;
        fileName?: string | undefined;
        uploadedAt?: string | undefined;
    }[] | undefined;
    checklist?: {
        inspectionComplete: boolean;
        reconditioningNeeded: boolean;
        photosTaken: boolean;
        listed: boolean;
    } | undefined;
}, {
    source: "TRADE_IN" | "WALKIN" | "PHONE" | "ONLINE" | "AUCTION" | "OTHER";
    vin: string;
    year: number;
    make: string;
    model: string;
    condition: "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "SALVAGE";
    odometer: number;
    purchaseDate: Date;
    purchasePrice: number;
    sellerType: "AUCTION" | "INDIVIDUAL" | "COMPANY" | "DEALER";
    sellerName: string;
    notes?: string | undefined;
    trim?: string | undefined;
    exteriorColor?: string | undefined;
    interiorColor?: string | undefined;
    sellerPhone?: string | undefined;
    sellerEmail?: string | undefined;
    sellerAddress?: {
        street?: string | undefined;
        city?: string | undefined;
        country?: string | undefined;
        province?: string | undefined;
        postalCode?: string | undefined;
    } | undefined;
    documents?: {
        type: "OTHER" | "BILL_OF_SALE" | "OWNERSHIP" | "INSURANCE" | "INSPECTION";
        s3Key?: string | undefined;
        fileName?: string | undefined;
        uploadedAt?: string | undefined;
    }[] | undefined;
    checklist?: {
        inspectionComplete?: boolean | undefined;
        reconditioningNeeded?: boolean | undefined;
        photosTaken?: boolean | undefined;
        listed?: boolean | undefined;
    } | undefined;
}>;
export type CreateVehiclePurchaseInput = z.infer<typeof CreateVehiclePurchaseSchema>;
export declare const UpdateVehiclePurchaseSchema: z.ZodObject<{
    vin: z.ZodOptional<z.ZodString>;
    year: z.ZodOptional<z.ZodNumber>;
    make: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    trim: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    odometer: z.ZodOptional<z.ZodNumber>;
    exteriorColor: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    interiorColor: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    condition: z.ZodOptional<z.ZodEnum<["EXCELLENT", "GOOD", "FAIR", "POOR", "SALVAGE"]>>;
    purchaseDate: z.ZodOptional<z.ZodDate>;
    purchasePrice: z.ZodOptional<z.ZodNumber>;
    source: z.ZodOptional<z.ZodEnum<["WALKIN", "PHONE", "ONLINE", "AUCTION", "TRADE_IN", "OTHER"]>>;
    sellerType: z.ZodOptional<z.ZodEnum<["INDIVIDUAL", "COMPANY", "DEALER", "AUCTION"]>>;
    sellerName: z.ZodOptional<z.ZodString>;
    sellerPhone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    sellerEmail: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>>;
    sellerAddress: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        street: z.ZodOptional<z.ZodString>;
        city: z.ZodOptional<z.ZodString>;
        province: z.ZodOptional<z.ZodString>;
        postalCode: z.ZodOptional<z.ZodString>;
        country: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        country: string;
        street?: string | undefined;
        city?: string | undefined;
        province?: string | undefined;
        postalCode?: string | undefined;
    }, {
        street?: string | undefined;
        city?: string | undefined;
        country?: string | undefined;
        province?: string | undefined;
        postalCode?: string | undefined;
    }>>>;
    documents: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["BILL_OF_SALE", "OWNERSHIP", "INSURANCE", "INSPECTION", "OTHER"]>;
        s3Key: z.ZodOptional<z.ZodString>;
        fileName: z.ZodOptional<z.ZodString>;
        uploadedAt: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "OTHER" | "BILL_OF_SALE" | "OWNERSHIP" | "INSURANCE" | "INSPECTION";
        s3Key?: string | undefined;
        fileName?: string | undefined;
        uploadedAt?: string | undefined;
    }, {
        type: "OTHER" | "BILL_OF_SALE" | "OWNERSHIP" | "INSURANCE" | "INSPECTION";
        s3Key?: string | undefined;
        fileName?: string | undefined;
        uploadedAt?: string | undefined;
    }>, "many">>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    checklist: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        inspectionComplete: z.ZodDefault<z.ZodBoolean>;
        reconditioningNeeded: z.ZodDefault<z.ZodBoolean>;
        photosTaken: z.ZodDefault<z.ZodBoolean>;
        listed: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        inspectionComplete: boolean;
        reconditioningNeeded: boolean;
        photosTaken: boolean;
        listed: boolean;
    }, {
        inspectionComplete?: boolean | undefined;
        reconditioningNeeded?: boolean | undefined;
        photosTaken?: boolean | undefined;
        listed?: boolean | undefined;
    }>>>;
} & {
    status: z.ZodOptional<z.ZodEnum<["DRAFT", "PENDING", "COMPLETED", "CANCELLED"]>>;
}, "strip", z.ZodTypeAny, {
    status?: "PENDING" | "COMPLETED" | "CANCELLED" | "DRAFT" | undefined;
    source?: "TRADE_IN" | "WALKIN" | "PHONE" | "ONLINE" | "AUCTION" | "OTHER" | undefined;
    notes?: string | undefined;
    vin?: string | undefined;
    year?: number | undefined;
    make?: string | undefined;
    model?: string | undefined;
    trim?: string | undefined;
    condition?: "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "SALVAGE" | undefined;
    odometer?: number | undefined;
    exteriorColor?: string | undefined;
    interiorColor?: string | undefined;
    purchaseDate?: Date | undefined;
    purchasePrice?: number | undefined;
    sellerType?: "AUCTION" | "INDIVIDUAL" | "COMPANY" | "DEALER" | undefined;
    sellerName?: string | undefined;
    sellerPhone?: string | undefined;
    sellerEmail?: string | undefined;
    sellerAddress?: {
        country: string;
        street?: string | undefined;
        city?: string | undefined;
        province?: string | undefined;
        postalCode?: string | undefined;
    } | undefined;
    documents?: {
        type: "OTHER" | "BILL_OF_SALE" | "OWNERSHIP" | "INSURANCE" | "INSPECTION";
        s3Key?: string | undefined;
        fileName?: string | undefined;
        uploadedAt?: string | undefined;
    }[] | undefined;
    checklist?: {
        inspectionComplete: boolean;
        reconditioningNeeded: boolean;
        photosTaken: boolean;
        listed: boolean;
    } | undefined;
}, {
    status?: "PENDING" | "COMPLETED" | "CANCELLED" | "DRAFT" | undefined;
    source?: "TRADE_IN" | "WALKIN" | "PHONE" | "ONLINE" | "AUCTION" | "OTHER" | undefined;
    notes?: string | undefined;
    vin?: string | undefined;
    year?: number | undefined;
    make?: string | undefined;
    model?: string | undefined;
    trim?: string | undefined;
    condition?: "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "SALVAGE" | undefined;
    odometer?: number | undefined;
    exteriorColor?: string | undefined;
    interiorColor?: string | undefined;
    purchaseDate?: Date | undefined;
    purchasePrice?: number | undefined;
    sellerType?: "AUCTION" | "INDIVIDUAL" | "COMPANY" | "DEALER" | undefined;
    sellerName?: string | undefined;
    sellerPhone?: string | undefined;
    sellerEmail?: string | undefined;
    sellerAddress?: {
        street?: string | undefined;
        city?: string | undefined;
        country?: string | undefined;
        province?: string | undefined;
        postalCode?: string | undefined;
    } | undefined;
    documents?: {
        type: "OTHER" | "BILL_OF_SALE" | "OWNERSHIP" | "INSURANCE" | "INSPECTION";
        s3Key?: string | undefined;
        fileName?: string | undefined;
        uploadedAt?: string | undefined;
    }[] | undefined;
    checklist?: {
        inspectionComplete?: boolean | undefined;
        reconditioningNeeded?: boolean | undefined;
        photosTaken?: boolean | undefined;
        listed?: boolean | undefined;
    } | undefined;
}>;
export type UpdateVehiclePurchaseInput = z.infer<typeof UpdateVehiclePurchaseSchema>;
//# sourceMappingURL=index.d.ts.map
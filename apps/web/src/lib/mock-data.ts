/**
 * Mock data for DealerOS development.
 * Used in place of the real API until the backend is wired up.
 * All shapes match the API types in `@/types/api`.
 */

import type {
  Lead,
  LeadSource,
  LeadStatus,
  Vehicle,
  VehicleStatus,
  Customer,
  CreditTier,
  Activity,
  Deal,
  DashboardKpi,
  LeadSourceDatum,
  AgedInventoryItem,
  User,
  BusinessHours,
} from "@/types/api";

/* ------------------------------------------------------------------ */
/* Reference data                                                     */
/* ------------------------------------------------------------------ */

export const USERS: User[] = [
  { id: "u_001", name: "Marcus Chen", role: "owner", email: "marcus@dealeros.demo", avatarColor: "#E8FF47" },
  { id: "u_002", name: "Lisa Park", role: "manager", email: "lisa@dealeros.demo", avatarColor: "#3B82F6" },
  { id: "u_003", name: "Diego Ramirez", role: "salesperson", email: "diego@dealeros.demo", avatarColor: "#22D3A0" },
  { id: "u_004", name: "Sarah Kim", role: "salesperson", email: "sarah@dealeros.demo", avatarColor: "#A855F7" },
  { id: "u_005", name: "Jordan Blake", role: "salesperson", email: "jordan@dealeros.demo", avatarColor: "#F97316" },
];

export const LEAD_SOURCES: LeadSource[] = [
  "Website",
  "Walk-in",
  "Phone",
  "Referral",
  "Facebook",
  "Google Ads",
  "Email",
  "Other",
];

export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "test_drive",
  "negotiating",
  "closed_won",
  "lost",
];

export const VEHICLE_STATUSES: VehicleStatus[] = [
  "available",
  "pending",
  "sold",
  "in_service",
  "wholesale",
];

export const CREDIT_TIERS: CreditTier[] = ["A", "B", "C", "D", "subprime"];

/* ------------------------------------------------------------------ */
/* Leads                                                              */
/* ------------------------------------------------------------------ */

const leadNames = [
  "Sarah Mitchell",
  "James Wilson",
  "Emily Rodriguez",
  "Michael Chen",
  "David Martinez",
  "Jessica Brown",
  "Robert Taylor",
  "Amanda Garcia",
  "Christopher Lee",
  "Olivia Anderson",
  "Daniel Thomas",
  "Sophia Jackson",
  "Matthew White",
  "Isabella Harris",
  "Andrew Martin",
  "Mia Thompson",
  "Ethan Robinson",
  "Ava Clark",
  "Joshua Lewis",
  "Charlotte Walker",
  "Ryan Hall",
  "Amelia Allen",
  "Nathan Young",
  "Harper King",
  "Tyler Wright",
  "Evelyn Scott",
  "Brandon Green",
  "Abigail Adams",
  "Kevin Baker",
  "Sofia Hill",
];

const vehicleInterests = [
  "2024 Honda Accord",
  "2024 Toyota Camry",
  "2024 Mazda CX-5",
  "2024 Subaru Outback",
  "2024 Ford F-150",
  "2024 Chevrolet Silverado",
  "2024 Tesla Model 3",
  "2024 BMW 3 Series",
  "2024 Mercedes C-Class",
  "2024 Audi A4",
  "2024 Hyundai Tucson",
  "2024 Kia Sorento",
  "2024 Volkswagen Jetta",
  "2024 Nissan Altima",
  "2024 Jeep Grand Cherokee",
  "2023 Honda CR-V",
  "2023 Toyota RAV4",
  "2023 Ford Escape",
];

const stagesByIdx = (i: number): LeadStatus => {
  const stages: LeadStatus[] = [
    "new",
    "new",
    "new",
    "contacted",
    "contacted",
    "contacted",
    "test_drive",
    "test_drive",
    "negotiating",
    "negotiating",
    "closed_won",
    "lost",
  ];
  return stages[i % stages.length];
};

function scoreForStatus(status: LeadStatus): number {
  if (status === "new") return 20 + Math.floor(Math.random() * 30);
  if (status === "contacted") return 35 + Math.floor(Math.random() * 25);
  if (status === "test_drive") return 55 + Math.floor(Math.random() * 20);
  if (status === "negotiating") return 70 + Math.floor(Math.random() * 20);
  if (status === "closed_won") return 95;
  return 15;
}

function daysAgo(d: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt.toISOString();
}

function minsAgo(m: number): string {
  const dt = new Date();
  dt.setMinutes(dt.getMinutes() - m);
  return dt.toISOString();
}

export const MOCK_LEADS: Lead[] = leadNames.map((name, i) => {
  const status = stagesByIdx(i);
  return {
    id: `ld_${String(i + 1).padStart(4, "0")}`,
    name,
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@email.demo`,
    phone: `(${200 + i}) 555-${String(1000 + i * 37).slice(-4)}`,
    source: LEAD_SOURCES[i % LEAD_SOURCES.length],
    status,
    score: scoreForStatus(status),
    assignedTo: USERS[i % USERS.length],
    vehicleInterest: vehicleInterests[i % vehicleInterests.length],
    notes: i % 5 === 0 ? "Wants to test drive this weekend." : "",
    createdAt: daysAgo(i % 14),
    updatedAt: minsAgo(i * 17),
  };
});

/* ------------------------------------------------------------------ */
/* Vehicles                                                           */
/* ------------------------------------------------------------------ */

const makes = [
  { make: "Honda", models: ["Civic", "Accord", "CR-V", "Pilot"] },
  { make: "Toyota", models: ["Camry", "Corolla", "RAV4", "Tacoma"] },
  { make: "Ford", models: ["F-150", "Escape", "Explorer", "Mustang"] },
  { make: "Chevrolet", models: ["Silverado", "Equinox", "Malibu", "Tahoe"] },
  { make: "BMW", models: ["3 Series", "5 Series", "X3", "X5"] },
  { make: "Mercedes", models: ["C-Class", "E-Class", "GLC", "GLE"] },
  { make: "Tesla", models: ["Model 3", "Model Y", "Model S", "Model X"] },
  { make: "Mazda", models: ["CX-5", "CX-9", "Mazda3", "MX-5"] },
  { make: "Subaru", models: ["Outback", "Forester", "Crosstrek", "Impreza"] },
  { make: "Hyundai", models: ["Sonata", "Tucson", "Santa Fe", "Elantra"] },
];

function makeVin(idx: number): string {
  const tail = String(idx).padStart(6, "0");
  return `1HGBH41JXMN${tail}`.slice(0, 17);
}

const vehicleStatuses: VehicleStatus[] = [
  "available",
  "available",
  "available",
  "available",
  "pending",
  "pending",
  "sold",
  "in_service",
];

function priceFor(make: string, year: number): number {
  const base = make === "BMW" || make === "Mercedes" || make === "Tesla" ? 38000 : 24000;
  const ageFactor = 2024 - year;
  return base - ageFactor * 1500 + Math.floor(Math.random() * 4000);
}

export const MOCK_VEHICLES: Vehicle[] = Array.from({ length: 36 }).map((_, i) => {
  const mk = makes[i % makes.length];
  const model = mk.models[i % mk.models.length];
  const year = 2019 + (i % 6);
  const status = vehicleStatuses[i % vehicleStatuses.length];
  const daysOnLot = (i * 7) % 130;
  const mileage = 5000 + i * 2300 + (i % 7) * 1300;
  return {
    id: `vh_${String(i + 1).padStart(4, "0")}`,
    vin: makeVin(i + 1),
    stockNumber: `STK${String(1000 + i).slice(-4)}`,
    make: mk.make,
    model,
    year,
    trim: ["LX", "EX", "Sport", "Limited"][i % 4],
    price: priceFor(mk.make, year),
    mileage,
    color: ["Black", "White", "Silver", "Blue", "Red", "Gray"][i % 6],
    status,
    daysOnLot,
    photoUrl: null,
    bodyStyle: (["Sedan", "SUV", "Truck", "Coupe"] as const)[i % 4],
    fuelType: (["Gas", "Hybrid", "Electric"] as const)[i % 3],
    transmission: (["Automatic", "Manual"] as const)[i % 2],
    createdAt: daysAgo(daysOnLot),
  };
});

/* ------------------------------------------------------------------ */
/* Customers                                                          */
/* ------------------------------------------------------------------ */

const customerFirstNames = [
  "Alice", "Brian", "Carla", "David", "Emma", "Frank", "Grace", "Henry",
  "Iris", "Jack", "Karen", "Liam", "Maya", "Noah", "Olivia", "Paul",
  "Quinn", "Rachel", "Sam", "Tina", "Uma", "Victor", "Wendy", "Xavier",
  "Yara", "Zane", "Alex", "Beth", "Carlos", "Diana",
];

const customerLastNames = [
  "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson",
  "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee",
];

const customerTiers: CreditTier[] = [
  "A", "A", "A", "B", "B", "B", "C", "C", "C", "D", "D", "subprime",
];

export const MOCK_CUSTOMERS: Customer[] = customerFirstNames.map((first, i) => {
  const last = customerLastNames[i % customerLastNames.length];
  const tier = customerTiers[i % customerTiers.length];
  return {
    id: `cu_${String(i + 1).padStart(4, "0")}`,
    name: `${first} ${last}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}@email.demo`,
    phone: `(${300 + i}) 555-${String(2000 + i * 13).slice(-4)}`,
    creditTier: tier,
    creditScore: tier === "A" ? 780 : tier === "B" ? 720 : tier === "C" ? 660 : tier === "D" ? 600 : 540,
    address: {
      street: `${100 + i * 7} Main St`,
      city: ["Austin", "Dallas", "Houston", "San Antonio"][i % 4],
      state: "TX",
      zip: `7870${i % 10}`,
    },
    vehicles: i % 2 === 0 ? [MOCK_VEHICLES[i % MOCK_VEHICLES.length]] : [],
    openDeals: i % 3 === 0 ? 1 : 0,
    lifetimeValue: i * 1200 + 4000,
    lastContact: daysAgo(i % 30),
    createdAt: daysAgo(120 + i * 3),
  };
});

/* ------------------------------------------------------------------ */
/* Activity feed                                                      */
/* ------------------------------------------------------------------ */

export const MOCK_ACTIVITY: Activity[] = [
  {
    id: "act_001",
    type: "deal_closed",
    actor: "Marcus Chen",
    target: "2024 Honda CR-V",
    detail: "Closed at $34,500",
    timestamp: minsAgo(10),
  },
  {
    id: "act_002",
    type: "vehicle_added",
    actor: "Lisa Park",
    target: "2024 Chevrolet Malibu",
    detail: "Stock #8847",
    timestamp: minsAgo(25),
  },
  {
    id: "act_003",
    type: "payment_received",
    actor: "System",
    target: "Robert Johnson",
    detail: "$2,450 received",
    timestamp: minsAgo(60),
  },
  {
    id: "act_004",
    type: "lead_aged",
    actor: "System",
    target: "David Martinez",
    detail: "7 days without contact",
    timestamp: minsAgo(120),
  },
  {
    id: "act_005",
    type: "test_drive",
    actor: "Diego Ramirez",
    target: "Emily Rodriguez",
    detail: "Completed test drive on 2024 Mazda CX-5",
    timestamp: minsAgo(180),
  },
  {
    id: "act_006",
    type: "lead_assigned",
    actor: "Lisa Park",
    target: "Sarah Mitchell",
    detail: "Assigned to Marcus Chen",
    timestamp: minsAgo(240),
  },
  {
    id: "act_007",
    type: "ai_call",
    actor: "AI Sales Agent",
    target: "James Wilson",
    detail: "Outbound call completed (4m 12s)",
    timestamp: minsAgo(320),
  },
];

/* ------------------------------------------------------------------ */
/* Deals                                                              */
/* ------------------------------------------------------------------ */

export const MOCK_DEALS: Deal[] = MOCK_CUSTOMERS.slice(0, 6).map((c, i) => ({
  id: `dl_${String(i + 1).padStart(4, "0")}`,
  customerId: c.id,
  customerName: c.name,
  vehicleId: MOCK_VEHICLES[i].id,
  vehicleLabel: `${MOCK_VEHICLES[i].year} ${MOCK_VEHICLES[i].make} ${MOCK_VEHICLES[i].model}`,
  amount: MOCK_VEHICLES[i].price - 1500,
  status: i < 2 ? "open" : i < 4 ? "pending_funding" : "closed",
  createdAt: daysAgo(i * 3),
}));

/* ------------------------------------------------------------------ */
/* Dashboard data                                                     */
/* ------------------------------------------------------------------ */

export const MOCK_KPIS: DashboardKpi[] = [
  {
    label: "Total Leads",
    value: 142,
    change: 12.4,
    icon: "users",
    tone: "info",
  },
  {
    label: "Active Deals",
    value: 23,
    change: 5.1,
    icon: "handshake",
    tone: "accent",
  },
  {
    label: "Vehicles in Stock",
    value: 128,
    change: 8,
    icon: "car",
    tone: "warning",
  },
  {
    label: "Revenue MTD",
    value: 1842500,
    change: 18.2,
    icon: "dollar",
    tone: "success",
    format: "currency",
  },
];

export const MOCK_LEAD_SOURCE_DATA: LeadSourceDatum[] = [
  { source: "Website", count: 42 },
  { source: "Walk-in", count: 28 },
  { source: "Phone", count: 18 },
  { source: "Referral", count: 24 },
  { source: "Facebook", count: 15 },
  { source: "Google Ads", count: 11 },
  { source: "Email", count: 4 },
];

export const MOCK_AGED_INVENTORY: AgedInventoryItem[] = MOCK_VEHICLES
  .filter((v) => v.daysOnLot > 60)
  .sort((a, b) => b.daysOnLot - a.daysOnLot)
  .slice(0, 5)
  .map((v) => ({
    id: v.id,
    label: `${v.year} ${v.make} ${v.model}`,
    stockNumber: v.stockNumber,
    daysOnLot: v.daysOnLot,
    price: v.price,
  }));

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export const MOCK_BUSINESS_HOURS: BusinessHours[] = [
  { day: "Monday", open: "09:00", close: "19:00", closed: false },
  { day: "Tuesday", open: "09:00", close: "19:00", closed: false },
  { day: "Wednesday", open: "09:00", close: "19:00", closed: false },
  { day: "Thursday", open: "09:00", close: "19:00", closed: false },
  { day: "Friday", open: "09:00", close: "20:00", closed: false },
  { day: "Saturday", open: "10:00", close: "18:00", closed: false },
  { day: "Sunday", open: "", close: "", closed: true },
];

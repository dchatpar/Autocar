/**
 * DealerOS — Database Seed
 * Realistic dev data: 2 dealers, 5 users each, 20 leads, 10 customers,
 * 15 vehicles, 3 active deals, BHPH contracts, etc.
 *
 * Run: pnpm --filter @dealeros/db seed
 * Requires DATABASE_URL in .env
 */

import { PrismaClient, DealerPlan, UserRole, LeadStatus, VehicleCondition, VehicleStatus, DealStatus, DealType, CreditTier, AppointmentType, AppointmentStatus, CommunicationChannel, CommunicationDirection, CommunicationStatus, MediaType, SyndicationChannel, FiProductType, ActivityType, EntityType, Appointment as PrismaAppointment } from '@prisma/client';
import { hash } from 'bcrypt';

const prisma = new PrismaClient();

// ─── Helpers ────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 11) + Math.random().toString(36).slice(2, 11);
}

function phone(): string {
  const area = Math.floor(Math.random() * 900 + 200);
  const mid = Math.floor(Math.random() * 900 + 100);
  const last = Math.floor(Math.random() * 9000 + 1000);
  return `(${area}) ${mid}-${last}`;
}

function vin(): string {
  const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  let v = '';
  for (let i = 0; i < 17; i++) {
    v += chars[Math.floor(Math.random() * chars.length)];
  }
  return v;
}

function stockNum(): string {
  return `STK-${Math.floor(Math.random() * 90000 + 10000)}`;
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function hashPassword(password: string): Promise<string> {
  return hash(password, 12);
}

// ─── Seed Data ──────────────────────────────────────────────────────────────

const dealers = [
  {
    id: uid() + '-dealer',
    name: 'Northgate Auto Group',
    subdomain: 'northgate',
    plan: DealerPlan.PRO,
    settings: JSON.stringify({ timezone: 'America/Edmonton', currency: 'CAD', locale: 'en-CA' }),
    trialEndsAt: null,
  },
  {
    id: uid() + '-dealer',
    name: 'Valley Motors Ltd.',
    subdomain: 'valley',
    plan: DealerPlan.GROWTH,
    settings: JSON.stringify({ timezone: 'America/Vancouver', currency: 'CAD', locale: 'en-CA' }),
    trialEndsAt: null,
  },
];

const users = [
  // Northgate users
  { dealerIdx: 0, name: 'Marcus Webb', email: 'marcus@northgateauto.com', role: UserRole.ADMIN, phone: phone() },
  { dealerIdx: 0, name: 'Tanya Reznik', email: 'tanya@northgateauto.com', role: UserRole.MANAGER, phone: phone() },
  { dealerIdx: 0, name: 'Devon Cho', email: 'devon@northgateauto.com', role: UserRole.SALES, phone: phone() },
  { dealerIdx: 0, name: 'Priya Lal', email: 'priya@northgateauto.com', role: UserRole.BDC, phone: phone() },
  { dealerIdx: 0, name: 'Cal Nguyen', email: 'cal@northgateauto.com', role: UserRole.FINANCE, phone: phone() },
  // Valley users
  { dealerIdx: 1, name: 'Sarah Ostrowski', email: 'sarah@valleymotors.ca', role: UserRole.ADMIN, phone: phone() },
  { dealerIdx: 1, name: 'Jake Rempel', email: 'jake@valleymotors.ca', role: UserRole.MANAGER, phone: phone() },
  { dealerIdx: 1, name: 'Elena Castillo', email: 'elena@valleymotors.ca', role: UserRole.SALES, phone: phone() },
  { dealerIdx: 1, name: 'Trevor Hsu', email: 'trevor@valleymotors.ca', role: UserRole.SALES, phone: phone() },
  { dealerIdx: 1, name: 'Nadia Fouad', email: 'nadia@valleymotors.ca', role: UserRole.FINANCE, phone: phone() },
];

const firstNames = ['James', 'Lisa', 'Roberto', 'Aisha', 'Chen', 'Natasha', 'Brandon', 'Fatima', 'Liam', 'Yuki', 'Carlos', 'Mei', 'Tyrone', 'Anika', 'Ethan', 'Rania', 'Patrick', 'Svetlana', 'Andre', 'Jasmine'];
const lastNames = ['Oduya', 'Morrison', 'Patel', 'Tanaka', 'Williams', 'Hassan', 'Garcia', 'Kim', 'Nguyen', 'Berg', 'Santos', 'Johansson', 'Nkrumah', 'Lopes', 'Chen', 'Okafor', 'Bouchard', 'Yamamoto', 'Dubois', 'Singh'];
const makes = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'BMW', 'Mercedes-Benz', 'Hyundai', 'Kia', 'Nissan', 'Mazda', 'Volkswagen', 'Subaru', 'Jeep', 'Ram', 'GMC'];
const models: Record<string, string[]> = {
  'Toyota': ['Camry', 'RAV4', 'Corolla', 'Highlander', 'Tacoma'],
  'Honda': ['Civic', 'CR-V', 'Accord', 'Pilot', 'HR-V'],
  'Ford': ['F-150', 'Escape', 'Explorer', 'Bronco', 'Mustang'],
  'Chevrolet': ['Silverado', 'Equinox', 'Malibu', 'Traverse', 'Colorado'],
  'BMW': ['3 Series', '5 Series', 'X3', 'X5', 'X1'],
  'Mercedes-Benz': ['C-Class', 'E-Class', 'GLC', 'GLE', 'A-Class'],
  'Hyundai': ['Elantra', 'Tucson', 'Sonata', 'Santa Fe', 'Kona'],
  'Kia': ['Forte', 'Sportage', 'Seltos', 'Telluride', 'Soul'],
  'Nissan': ['Altima', 'Rogue', 'Sentra', 'Pathfinder', 'Frontier'],
  'Mazda': ['CX-5', 'Mazda3', 'CX-30', 'CX-9', 'MX-5'],
  'Volkswagen': ['Jetta', 'Tiguan', 'Atlas', 'Golf', 'Passat'],
  'Subaru': ['Outback', 'Forester', 'Crosstrek', 'Impreza', 'WRX'],
  'Jeep': ['Wrangler', 'Grand Cherokee', 'Cherokee', 'Compass', 'Gladiator'],
  'Ram': ['1500', '2500', '3500', 'ProMaster'],
  'GMC': ['Sierra', 'Terrain', 'Acadia', 'Yukon', 'Canyon'],
};
const colors = ['Black', 'White', 'Silver', 'Blue', 'Red', 'Grey', 'Green', 'Orange', 'Brown', 'Navy'];
const transmissions = ['Automatic', 'Manual', 'CVT'];
const fuels = ['Gasoline', 'Diesel', 'Hybrid', 'Electric', 'Plug-in Hybrid'];
const drivetrains = ['FWD', 'RWD', 'AWD', '4WD'];
const bodyStyles = ['Sedan', 'SUV', 'Truck', 'Coupe', 'Hatchback', 'Wagon', 'Van', 'Convertible'];
const sources = ['Google Ads', 'Facebook', 'Walk-in', 'Referral', 'Craigslist', 'AutoTrader', 'Kijiji', 'Instagram', 'TikTok', 'Email Campaign'];
const statuses: LeadStatus[] = [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.APPOINTMENT, LeadStatus.DEMO, LeadStatus.DEAL, LeadStatus.LOST];

const vehicleData = [
  { make: 'Toyota', model: 'RAV4', year: 2023, trim: 'XLE', condition: VehicleCondition.NEW, mileage: 12, internetPrice: 42499 },
  { make: 'Honda', model: 'Civic', year: 2024, trim: 'Sport', condition: VehicleCondition.NEW, mileage: 8, internetPrice: 34999 },
  { make: 'Ford', model: 'F-150', year: 2023, trim: 'XLT', condition: VehicleCondition.USED, mileage: 28400, internetPrice: 48995 },
  { make: 'BMW', model: '3 Series', year: 2022, trim: '330i xDrive', condition: VehicleCondition.CERTIFIED, mileage: 22100, internetPrice: 45990 },
  { make: 'Hyundai', model: 'Tucson', year: 2023, trim: 'Preferred', condition: VehicleCondition.NEW, mileage: 0, internetPrice: 38999 },
  { make: 'Mazda', model: 'CX-5', year: 2023, trim: 'GT', condition: VehicleCondition.USED, mileage: 18600, internetPrice: 37995 },
  { make: 'Toyota', model: 'Camry', year: 2024, trim: 'SE', condition: VehicleCondition.NEW, mileage: 5, internetPrice: 36499 },
  { make: 'Volkswagen', model: 'Tiguan', year: 2023, trim: 'Comfortline', condition: VehicleCondition.NEW, mileage: 1500, internetPrice: 41995 },
  { make: 'Jeep', model: 'Grand Cherokee', year: 2022, trim: 'Laredo', condition: VehicleCondition.USED, mileage: 35200, internetPrice: 43995 },
  { make: 'Subaru', model: 'Outback', year: 2023, trim: 'Limited', condition: VehicleCondition.NEW, mileage: 200, internetPrice: 44999 },
  { make: 'Kia', model: 'Sportage', year: 2023, trim: 'EX', condition: VehicleCondition.NEW, mileage: 800, internetPrice: 38499 },
  { make: 'GMC', model: 'Sierra', year: 2022, trim: 'SLE', condition: VehicleCondition.USED, mileage: 42100, internetPrice: 52995 },
  { make: 'Nissan', model: 'Rogue', year: 2024, trim: 'SL', condition: VehicleCondition.NEW, mileage: 10, internetPrice: 39999 },
  { make: 'Honda', model: 'CR-V', year: 2023, trim: 'EX-L', condition: VehicleCondition.NEW, mileage: 500, internetPrice: 42999 },
  { make: 'Chevrolet', model: 'Equinox', year: 2023, trim: 'LT', condition: VehicleCondition.NEW, mileage: 1200, internetPrice: 36995 },
];

// ─── Main Seed Function ─────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding DealerOS database…');

  // Clean existing data (dev only)
  await prisma.bhphPayment.deleteMany();
  await prisma.bhphContract.deleteMany();
  await prisma.fiProduct.deleteMany();
  await prisma.dealTerms.deleteMany();
  await prisma.document.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.syndicationLog.deleteMany();
  await prisma.vehicleMedia.deleteMany();
  await prisma.vehiclePricing.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.communication.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.leadScore.deleteMany();
  await prisma.agentRun.deleteMany();
  await prisma.embedding.deleteMany();
  await prisma.note.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.dealer.deleteMany();

  console.log('  ✓ Cleared existing data');

  // ── Dealers ─────────────────────────────────────────────────────────────
  const createdDealers = await Promise.all(
    dealers.map(d => prisma.dealer.create({ data: d }))
  );
  console.log(`  ✓ Created ${createdDealers.length} dealers`);

  // ── Users (5 per dealer) ─────────────────────────────────────────────────
  const createdUsers: Awaited<ReturnType<typeof prisma.user.create>>[] = [];
  for (const u of users) {
    const user = await prisma.user.create({
      data: {
        id: uid() + '-user',
        dealerId: createdDealers[u.dealerIdx].id,
        email: u.email,
        name: u.name,
        role: u.role,
        phone: u.phone,
        passwordHash: await hashPassword('dev-password-123'),
        permissions: JSON.stringify([]),
        lastLogin: null,
        createdAt: new Date(),
      },
    });
    createdUsers.push(user);
  }
  console.log(`  ✓ Created ${createdUsers.length} users`);

  // Helper: get random user for a dealer
  const usersByDealer = (dealerIdx: number) =>
    createdUsers.filter(u => u.dealerId === createdDealers[dealerIdx].id);

  // ── Customers (10 per dealer) ────────────────────────────────────────────
  const createdCustomers: Awaited<ReturnType<typeof prisma.customer.create>>[] = [];
  for (let dIdx = 0; dIdx < 2; dIdx++) {
    for (let c = 0; c < 10; c++) {
      const firstName = randomFrom(firstNames);
      const lastName = randomFrom(lastNames);
      const customer = await prisma.customer.create({
        data: {
          id: uid() + '-cust',
          dealerId: createdDealers[dIdx].id,
          firstName,
          lastName,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${c}@example.com`,
          phone: phone(),
          address: JSON.stringify({
            street: `${Math.floor(Math.random() * 9000 + 100)} Main St`,
            city: randomFrom(['Calgary', 'Edmonton', 'Vancouver', 'Surrey', 'Victoria', 'Kelowna']),
            province: randomFrom(['AB', 'BC']),
            postal: `T${Math.floor(Math.random() * 9 + 1)}${String.fromCharCode(65 + Math.floor(Math.random() * 26))} ${Math.floor(Math.random() * 9 + 1)}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${Math.floor(Math.random() * 9 + 1)}`,
          }),
          dob: new Date(1970 + Math.floor(Math.random() * 30), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
          creditTier: randomFrom([CreditTier.A, CreditTier.B, CreditTier.C, CreditTier.D]),
          dlNumber: `DL${Math.floor(Math.random() * 900000 + 100000)}`,
          dlProvince: randomFrom(['AB', 'BC']),
          notes: c % 3 === 0 ? `Preferred contact method: ${randomFrom(['phone', 'email', 'text'])}` : null,
          tags: c % 2 === 0 ? [randomFrom(['vip', 'warranty_expired', 'service_due', 'financing', 'trade_in'])] : [],
          createdAt: new Date(),
        },
      });
      createdCustomers.push(customer);
    }
  }
  console.log(`  ✓ Created ${createdCustomers.length} customers`);

  // ── Leads (20 per dealer) ────────────────────────────────────────────────
  const createdLeads: Awaited<ReturnType<typeof prisma.lead.create>>[] = [];
  for (let dIdx = 0; dIdx < 2; dIdx++) {
    const dealerUsers = usersByDealer(dIdx);
    for (let l = 0; l < 20; l++) {
      const firstName = randomFrom(firstNames);
      const lastName = randomFrom(lastNames);
      const make = randomFrom(Object.keys(models));
      const model = randomFrom(models[make]);
      const lead = await prisma.lead.create({
        data: {
          id: uid() + '-lead',
          dealerId: createdDealers[dIdx].id,
          source: randomFrom(sources),
          status: randomFrom(statuses),
          score: Math.floor(Math.random() * 101),
          assignedToId: Math.random() > 0.3 ? randomFrom(dealerUsers).id : null,
          firstName,
          lastName,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${l}@example.com`,
          phone: phone(),
          vehicleInterest: JSON.stringify([{ make, model, year: 2022 + Math.floor(Math.random() * 3) }]),
          sourceMeta: JSON.stringify({ campaign: randomFrom(['google', 'facebook', 'organic']), keyword: 'used car' }),
          createdAt: new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000),
          updatedAt: new Date(),
        },
      });
      createdLeads.push(lead);
    }
  }
  console.log(`  ✓ Created ${createdLeads.length} leads`);

  // ── Vehicles (15 per dealer) ─────────────────────────────────────────────
  const createdVehicles: Awaited<ReturnType<typeof prisma.vehicle.create>>[] = [];
  for (let dIdx = 0; dIdx < 2; dIdx++) {
    for (let vIdx = 0; vIdx < vehicleData.length; vIdx++) {
      const vd = vehicleData[vIdx];
      const vehicle = await prisma.vehicle.create({
        data: {
          id: uid() + '-veh',
          dealerId: createdDealers[dIdx].id,
          vin: vin(),
          make: vd.make,
          model: vd.model,
          year: vd.year,
          trim: vd.trim,
          bodyStyle: randomFrom(bodyStyles),
          mileage: vd.mileage,
          exteriorColor: randomFrom(colors),
          interiorColor: randomFrom(colors),
          fuelType: randomFrom(fuels),
          transmission: randomFrom(transmissions),
          drivetrain: randomFrom(drivetrains),
          engine: `${vd.year <= 2022 ? '2.0L' : vd.make === 'BMW' || vd.make === 'Mercedes-Benz' ? '3.0L' : '2.5L'} ${randomFrom(['I4', 'V6', 'V8'])}`,
          condition: vd.condition,
          status: VehicleStatus.AVAILABLE,
          stockNumber: stockNum(),
          notes: null,
          acquiredAt: new Date(Date.now() - Math.floor(Math.random() * 90) * 86400000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      createdVehicles.push(vehicle);

      // Vehicle pricing
      const cost = vd.internetPrice * (0.82 + Math.random() * 0.08);
      await prisma.vehiclePricing.create({
        data: {
          vehicleId: vehicle.id,
          cost: Math.round(cost * 100) / 100,
          askingPrice: vd.internetPrice,
          internetPrice: Math.round(vd.internetPrice * (0.98 + Math.random() * 0.02)),
          marketValue: Math.round(vd.internetPrice * (1.0 + Math.random() * 0.05)),
          floorPlan: Math.round(cost * 1.04 * 100) / 100,
          reconCost: Math.round(vd.internetPrice * 0.02),
          updatedAt: new Date(),
        },
      });

      // Vehicle media (3 photos per vehicle)
      for (let m = 0; m < 3; m++) {
        await prisma.vehicleMedia.create({
          data: {
            vehicleId: vehicle.id,
            dealerId: createdDealers[dIdx].id,
            s3Key: `dealers/${createdDealers[dIdx].id}/vehicles/${vehicle.id}/photo_${m + 1}.jpg`,
            cdnUrl: `https://cdn.dealeros.com/vehicles/${vehicle.id}/photo_${m + 1}.jpg`,
            type: MediaType.PHOTO,
            sortOrder: m,
            aiScore: 0.7 + Math.random() * 0.3,
            isPrimary: m === 0,
            uploadedAt: new Date(),
          },
        });
      }

      // Syndication logs (2 channels per vehicle)
      const channels = randomFrom([[SyndicationChannel.AUTOTRADER, SyndicationChannel.CARGURUS], [SyndicationChannel.KIJIJI, SyndicationChannel.FACEBOOK], [SyndicationChannel.AUTOTRADER, SyndicationChannel.FACEBOOK]]);
      for (const channel of channels) {
        await prisma.syndicationLog.create({
          data: {
            vehicleId: vehicle.id,
            dealerId: createdDealers[dIdx].id,
            channel,
            status: 'active',
            externalId: `ext-${uid()}`,
            lastSynced: new Date(Date.now() - Math.floor(Math.random() * 48) * 3600000),
            createdAt: new Date(),
          },
        });
      }
    }
  }
  console.log(`  ✓ Created ${createdVehicles.length} vehicles with pricing, media, syndication`);

  // ── Deals (3 per dealer) ─────────────────────────────────────────────────
  const dealStatuses: DealStatus[] = [DealStatus.WORKING, DealStatus.PENDING_FINANCE, DealStatus.APPROVED, DealStatus.DELIVERED];
  const dealTypes: DealType[] = [DealType.RETAIL, DealType.LEASE, DealType.BHPH, DealType.CASH];

  const createdDeals: Awaited<ReturnType<typeof prisma.deal.create>>[] = [];
  for (let dIdx = 0; dIdx < 2; dIdx++) {
    const dealerCustomers = createdCustomers.filter(c => c.dealerId === createdDealers[dIdx].id);
    const dealerVehicles = createdVehicles.filter(v => v.dealerId === createdDealers[dIdx].id);
    const dealerLeads = createdLeads.filter(l => l.dealerId === createdDealers[dIdx].id);
    const dealerUsers = usersByDealer(dIdx);

    for (let dl = 0; dl < 3; dl++) {
      const customer = randomFrom(dealerCustomers);
      const vehicle = randomFrom(dealerVehicles);
      const lead = Math.random() > 0.5 ? randomFrom(dealerLeads) : null;
      const assignedTo = randomFrom(dealerUsers);
      const dealType = randomFrom(dealTypes);
      const salePrice = (vehicle as any).internetPrice ?? 35000;
      const downPayment = Math.round(salePrice * (0.1 + Math.random() * 0.15));
      const financed = salePrice - downPayment;

      const deal = await prisma.deal.create({
        data: {
          id: uid() + '-deal',
          dealerId: createdDealers[dIdx].id,
          customerId: customer.id,
          vehicleId: vehicle.id,
          leadId: lead?.id ?? null,
          assignedToId: assignedTo.id,
          status: randomFrom(dealStatuses),
          dealType,
          createdAt: new Date(Date.now() - Math.floor(Math.random() * 45) * 86400000),
          deliveredAt: dealStatuses[dl % dealStatuses.length] === DealStatus.DELIVERED
            ? new Date(Date.now() - Math.floor(Math.random() * 20) * 86400000) : null,
        },
      });
      createdDeals.push(deal);

      // Deal terms
      await prisma.dealTerms.create({
        data: {
          dealId: deal.id,
          salePrice,
          tradeValue: Math.random() > 0.6 ? Math.round(salePrice * 0.25) : null,
          tradePayoff: Math.random() > 0.7 ? Math.round(salePrice * 0.28) : null,
          downPayment,
          taxAmount: Math.round(downPayment * 0.05),
          feeTotal: 1895,
          financedAmount: salePrice - downPayment,
          rate: dealType === DealType.BHPH ? 19.99 : (dealType === DealType.LEASE ? 4.9 : 7.2),
          termMonths: dealType === DealType.LEASE ? 48 : 72,
          paymentAmount: Math.round((financed / 72) * 1.07 * 100) / 100,
          lender: randomFrom(['TD Auto Finance', 'Royal Bank', 'Scotiabank', 'BMO', 'In-house']),
          frontGross: Math.round((salePrice * 0.03) * 100) / 100,
          backGross: Math.round((financed * 0.015) * 100) / 100,
        },
      });

      // F&I products (1-3 per deal)
      const numProducts = Math.floor(Math.random() * 3) + 1;
      for (let p = 0; p < numProducts; p++) {
        const productType = randomFrom([FiProductType.WARRANTY, FiProductType.GAP, FiProductType.TIRE_WHEEL, FiProductType.CREDIT_INSURANCE]);
        const sellingPrice = productType === FiProductType.WARRANTY ? 2495 : productType === FiProductType.GAP ? 695 : productType === FiProductType.TIRE_WHEEL ? 895 : 495;
        await prisma.fiProduct.create({
          data: {
            dealId: deal.id,
            productType,
            provider: randomFrom(['Zurich', 'Blue Star', 'Credit Insurance Co.', 'Guardian', 'CNA']),
            cost: Math.round(sellingPrice * 0.45),
            sellingPrice,
            termMonths: dealType === DealType.LEASE ? 48 : 72,
            deductible: productType === FiProductType.WARRANTY ? 100 : 50,
          },
        });
      }

      // BHPH contracts for BHPH deals
      if (dealType === DealType.BHPH) {
        const firstPayment = new Date(Date.now() + 15 * 86400000);
        const maturityDate = new Date(Date.now() + 24 * 30 * 86400000);
        const contract = await prisma.bhphContract.create({
          data: {
            dealId: deal.id,
            dealerId: createdDealers[dIdx].id,
            principal: financed,
            rate: 19.99,
            termMonths: 24,
            paymentAmount: Math.round((financed / 24) * 1.18 * 100) / 100,
            paymentDay: Math.floor(Math.random() * 28) + 1,
            firstPayment,
            maturityDate,
            totalPayments: Math.round((financed / 24) * 1.18 * 24),
            status: 'active',
          },
        });

        // BHPH payments (3 past + 2 future)
        const monthlyPayment = contract.paymentAmount;
        for (let pm = -3; pm <= 2; pm++) {
          const dueDate = new Date(firstPayment);
          dueDate.setMonth(dueDate.getMonth() + pm);
          const isPast = pm < 0;
          const isPaid = pm < -1;
          await prisma.bhphPayment.create({
            data: {
              contractId: contract.id,
              dealerId: createdDealers[dIdx].id,
              dueDate,
              paidDate: isPaid ? new Date(dueDate.getTime() + Math.floor(Math.random() * 5) * 86400000) : null,
              amountDue: monthlyPayment,
              amountPaid: isPaid ? monthlyPayment : null,
              principalPortion: isPaid ? Math.round(monthlyPayment * 0.72 * 100) / 100 : null,
              interestPortion: isPaid ? Math.round(monthlyPayment * 0.28 * 100) / 100 : null,
              balanceAfter: isPaid ? Math.round((financed - (Math.abs(pm) * monthlyPayment * 0.72)) * 100) / 100 : null,
              method: isPaid ? randomFrom(['cash', 'e-transfer', 'debit']) : null,
              status: isPaid ? 'paid' : isPast ? 'overdue' : 'pending',
            },
          });
        }
      }
    }
  }
  console.log(`  ✓ Created ${createdDeals.length} deals with terms, F&I products, BHPH contracts`);

  // ── Appointments (2 per dealer) ─────────────────────────────────────────
  for (let dIdx = 0; dIdx < 2; dIdx++) {
    const dealerLeads = createdLeads.filter(l => l.dealerId === createdDealers[dIdx].id);
    const dealerCustomers = createdCustomers.filter(c => c.dealerId === createdDealers[dIdx].id);
    const dealerUsers = usersByDealer(dIdx);
    const appointmentTypes: AppointmentType[] = [AppointmentType.SALES, AppointmentType.TEST_DRIVE, AppointmentType.SERVICE, AppointmentType.DELIVERY];
    const appointmentStatuses: AppointmentStatus[] = [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED];

    for (let a = 0; a < 2; a++) {
      const lead = randomFrom(dealerLeads);
      const customer = randomFrom(dealerCustomers);
      await prisma.appointment.create({
        data: {
          dealerId: createdDealers[dIdx].id,
          leadId: lead.id,
          customerId: Math.random() > 0.5 ? customer.id : null,
          assignedToId: randomFrom(dealerUsers).id,
          type: randomFrom(appointmentTypes),
          scheduledAt: new Date(Date.now() + (a - 1) * 3 * 86400000 + 10 * 3600000),
          durationMin: 30,
          status: randomFrom(appointmentStatuses),
          notes: a === 0 ? 'Customer requested SUV for test drive' : null,
          createdAt: new Date(),
        },
      });
    }
  }
  console.log('  ✓ Created 4 appointments');

  // ── Communications (3 per dealer) ────────────────────────────────────────
  for (let dIdx = 0; dIdx < 2; dIdx++) {
    const dealerLeads = createdLeads.filter(l => l.dealerId === createdDealers[dIdx].id);
    const channels: CommunicationChannel[] = [CommunicationChannel.SMS, CommunicationChannel.EMAIL, CommunicationChannel.WHATSAPP];
    for (let c = 0; c < 3; c++) {
      await prisma.communication.create({
        data: {
          dealerId: createdDealers[dIdx].id,
          leadId: randomFrom(dealerLeads).id,
          channel: randomFrom(channels),
          direction: CommunicationDirection.OUTBOUND,
          fromAddr: '+15875550000',
          toAddr: phone(),
          subject: c === 1 ? 'Your Vehicle is Ready for Test Drive' : null,
          body: c === 0 ? 'Hi, just following up on the RAV4 you inquired about. We have it in stock and can schedule a test drive.' : c === 1 ? 'Great news! The 2024 Camry you were interested in is available. Would Thursday work for a test drive?' : 'Check out our current offers on 2023 models — 0% financing for 48 months!',
          status: CommunicationStatus.DELIVERED,
          externalId: `msg-${uid()}`,
          aiGenerated: c === 2,
          sentAt: new Date(Date.now() - Math.floor(Math.random() * 14) * 86400000),
        },
      });
    }
  }
  console.log('  ✓ Created 6 communications');

  // ── Activities (5 per dealer) ────────────────────────────────────────────
  const activityTypes: ActivityType[] = [ActivityType.CALL, ActivityType.EMAIL, ActivityType.SMS, ActivityType.NOTE, ActivityType.STATUS_CHANGE, ActivityType.APPOINTMENT, ActivityType.AI_ACTION];
  for (let dIdx = 0; dIdx < 2; dIdx++) {
    const dealerLeads = createdLeads.filter(l => l.dealerId === createdDealers[dIdx].id);
    const dealerUsers = usersByDealer(dIdx);
    for (let a = 0; a < 5; a++) {
      const lead = randomFrom(dealerLeads);
      const user = randomFrom(dealerUsers);
      const type = randomFrom(activityTypes);
      await prisma.activity.create({
        data: {
          dealerId: createdDealers[dIdx].id,
          entityType: EntityType.LEAD,
          entityId: lead.id,
          type,
          body: type === ActivityType.CALL ? 'Discussed pricing and trade-in value. Customer wants to think it over.' : type === ActivityType.NOTE ? 'Customer has a trade-in (2019 Honda Civic). Needs valuation before decision.' : type === ActivityType.AI_ACTION ? 'AI follow-up message sent via SMS' : null,
          metadata: JSON.stringify({ duration: type === ActivityType.CALL ? 480 : null }),
          authorId: type === ActivityType.AI_ACTION ? null : user.id,
          agentName: type === ActivityType.AI_ACTION ? 'follow-up-agent' : null,
          createdAt: new Date(Date.now() - Math.floor(Math.random() * 10) * 86400000),
        },
      });
    }
  }
  console.log('  ✓ Created 10 activities');

  // ── Lead Scores (5 per dealer) ──────────────────────────────────────────
  for (let dIdx = 0; dIdx < 2; dIdx++) {
    const dealerLeads = createdLeads.filter(l => l.dealerId === createdDealers[dIdx].id).slice(0, 5);
    for (const lead of dealerLeads) {
      await prisma.leadScore.create({
        data: {
          leadId: lead.id,
          score: 40 + Math.random() * 55,
          signals: JSON.stringify({
            source: lead.source,
            engagement: Math.floor(Math.random() * 5) + 1,
            budget_match: Math.random() > 0.4,
            trade_in: Math.random() > 0.5,
          }),
          modelVersion: 'v2.1',
          scoredAt: new Date(),
        },
      });
    }
  }
  console.log('  ✓ Created 10 lead scores');

  // ── Agent Runs (2 per dealer) ───────────────────────────────────────────
  for (let dIdx = 0; dIdx < 2; dIdx++) {
    const agentNames = ['follow-up-agent', 'vehicle-match-agent', 'pricing-agent'];
    for (const agentName of agentNames.slice(0, 2)) {
      await prisma.agentRun.create({
        data: {
          dealerId: createdDealers[dIdx].id,
          agentName,
          entityType: 'lead',
          entityId: createdLeads.find(l => l.dealerId === createdDealers[dIdx].id)!.id,
          input: JSON.stringify({ prompt: `Follow up with lead regarding ${randomFrom(['RAV4', 'Civic', 'F-150'])} availability` }),
          output: JSON.stringify({ response: 'SMS sent successfully', leads_contacted: 1 }),
          tokensIn: Math.floor(Math.random() * 500) + 200,
          tokensOut: Math.floor(Math.random() * 300) + 100,
          costUsd: Math.round((Math.random() * 0.05) * 10000) / 10000,
          durationMs: Math.floor(Math.random() * 3000) + 500,
          status: 'success',
          createdAt: new Date(),
        },
      });
    }
  }
  console.log('  ✓ Created 4 agent runs');

  console.log('\n✅ Seed complete!');
  console.log(`   Dealers: ${createdDealers.length}`);
  console.log(`   Users: ${createdUsers.length}`);
  console.log(`   Customers: ${createdCustomers.length}`);
  console.log(`   Leads: ${createdLeads.length}`);
  console.log(`   Vehicles: ${createdVehicles.length}`);
  console.log(`   Deals: ${createdDeals.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
/**
 * Vehicle reference data routes — /api/v1/vehicles/*
 *
 * Provides static reference data for vehicle makes, models, and years.
 * This data can be used to populate dropdowns in the UI.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../utils/prisma.js";

function requireTenant(request: { tenant?: { dealerId: string } | null }): { dealerId: string } {
  if (!request.tenant) throw new Error("Tenant context required");
  return request.tenant;
}

// Common vehicle makes for the automotive industry
const COMMON_MAKES = [
  "Acura", "Alfa Romeo", "Aston Martin", "Audi", "Bentley", "BMW", "Buick",
  "Cadillac", "Chevrolet", "Chrysler", "Dodge", "Ferrari", "Ford", "GMC",
  "Genesis", "Honda", "Hyundai", "INFINITI", "Jaguar", "Jeep", "Kia",
  "Lamborghini", "Land Rover", "Lexus", "Lincoln", "Lotus", "Maserati",
  "Mazda", "McLaren", "Mercedes-Benz", "MINI", "Mitsubishi", "Nissan",
  "Pagani", "Porsche", "Ram", "Rolls-Royce", "Subaru", "Tesla", "Toyota",
  "Volkswagen", "Volvo",
];

// Common models per make (subset for demo)
const MODELS_BY_MAKE: Record<string, string[]> = {
  "Toyota": ["Camry", "Corolla", "RAV4", "Highlander", "Tacoma", "Tundra", "Prius", "4Runner", "Sienna", "Sequoia"],
  "Honda": ["Civic", "Accord", "CR-V", "Pilot", "HR-V", "Odyssey", "Ridgeline", "Passport"],
  "Ford": ["F-150", "Mustang", "Explorer", "Escape", "Bronco", "Edge", "Ranger", "Maverick"],
  "Chevrolet": ["Silverado", "Equinox", "Malibu", "Traverse", "Tahoe", "Suburban", "Colorado", "Camaro"],
  "BMW": ["3 Series", "5 Series", "X3", "X5", "X7", "7 Series", "M3", "M4"],
  "Mercedes-Benz": ["C-Class", "E-Class", "GLC", "GLE", "S-Class", "A-Class", "GLS"],
  "Audi": ["A4", "A6", "Q5", "Q7", "e-tron", "A3", "Q3", "RS6"],
  "Nissan": ["Altima", "Sentra", "Rogue", "Pathfinder", "Frontier", "Murano", "Maxima"],
  "Hyundai": ["Elantra", "Sonata", "Tucson", "Santa Fe", "Palisade", "Kona", "Venue"],
  "Kia": ["Forte", "K5", "Sportage", "Sorento", "Telluride", "Seltos", "Soul"],
  "Subaru": ["Outback", "Forester", "Crosstrek", "Impreza", "WRX", "Ascent", "BRZ"],
  "Tesla": ["Model 3", "Model Y", "Model S", "Model X", "Cybertruck"],
  "Mazda": ["Mazda3", "Mazda6", "CX-5", "CX-30", "CX-9", "MX-5 Miata"],
  "Volkswagen": ["Jetta", "Passat", "Tiguan", "Atlas", "Golf", "ID.4"],
  "Jeep": ["Wrangler", "Grand Cherokee", "Cherokee", "Compass", "Gladiator", "Renegade"],
  "Ram": ["1500", "2500", "3500", "ProMaster"],
  "Lexus": ["RX", "ES", "NX", "IS", "GX", "LS", "UX", "RC"],
  "Porsche": ["911", "Cayenne", "Macan", "Panamera", "Taycan", "718 Cayman"],
  "GMC": ["Sierra", "Yukon", "Terrain", "Acadia", "Canyon", "Hummer EV"],
  "Cadillac": ["Escalade", "CT4", "CT5", "XT4", "XT5", "XT6", "Lyriq"],
  "Buick": ["Enclave", "Encore GX", "Envision", "Regal"],
  "INFINITI": ["Q50", "Q60", "QX50", "QX60", "QX80", "G35", "G37"],
  "Acura": ["MDX", "RDX", "TLX", "ILX", "NSX", "Integra"],
  "Volvo": ["S60", "S90", "XC40", "XC60", "XC90", "V60", "V90"],
};

export async function vehiclesRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /vehicles/makes
   * List all available vehicle makes.
   * Returns both predefined common makes and makes found in inventory.
   */
  app.get(
    "/makes",
    {
      preHandler: [app.authenticate],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);

      // Get unique makes from inventory
      const inventoryMakes = await prisma.vehicle.findMany({
        where: { dealerId: ctx.dealerId },
        select: { make: true },
        distinct: ["make"],
        orderBy: { make: "asc" },
      });

      // Combine predefined and inventory makes, dedupe
      const allMakes = Array.from(
        new Set([...COMMON_MAKES, ...inventoryMakes.map((m) => m.make)])
      ).sort();

      return reply.status(200).send({
        data: allMakes.map((make) => ({
          value: make,
          label: make,
        })),
      });
    },
  );

  /**
   * GET /vehicles/models/:make
   * List models for a specific make.
   */
  app.get(
    "/models/:make",
    {
      preHandler: [app.authenticate],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const make = decodeURIComponent((request.params as { make?: string }).make ?? "");

      if (!make) {
        return reply.status(400).send({ error: "Make parameter is required" });
      }

      // Get models from inventory for this make
      const inventoryModels = await prisma.vehicle.findMany({
        where: {
          dealerId: ctx.dealerId,
          make: { equals: make, mode: "insensitive" },
        },
        select: { model: true },
        distinct: ["model"],
        orderBy: { model: "asc" },
      });

      // Get predefined models for this make
      const predefinedModels = MODELS_BY_MAKE[make] ?? [];

      // Combine and dedupe
      const allModels = Array.from(
        new Set([...predefinedModels, ...inventoryModels.map((m) => m.model)])
      ).sort();

      return reply.status(200).send({
        data: allModels.map((model) => ({
          value: model,
          label: model,
        })),
      });
    },
  );

  /**
   * GET /vehicles/years
   * List available years (current year + last 30 years).
   */
  app.get(
    "/years",
    {
      preHandler: [app.authenticate],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);

      // Get years from inventory
      const inventoryYears = await prisma.vehicle.findMany({
        where: { dealerId: ctx.dealerId },
        select: { year: true },
        distinct: ["year"],
        orderBy: { year: "desc" },
      });

      // Generate standard year range (current + last 30)
      const currentYear = new Date().getFullYear();
      const standardYears = Array.from(
        { length: 31 },
        (_, i) => currentYear - i
      );

      // Combine and dedupe
      const allYears = Array.from(
        new Set([...standardYears, ...inventoryYears.map((y) => y.year)])
      ).sort((a, b) => b - a);

      return reply.status(200).send({
        data: allYears.map((year) => ({
          value: year,
          label: String(year),
        })),
      });
    },
  );
}

export default vehiclesRoutes;

/**
 * Finance & F&I routes — /api/v1/finance/*
 *
 * F&I (Finance & Insurance) products and deal desk functionality:
 *   - GET  /fi-products              — list F&I products
 *   - POST /fi-products              — create F&I product
 *   - PUT  /fi-products/:id          — update F&I product
 *   - GET  /finance/deal/:dealId/options — calculate F&I options
 *   - POST /finance/deal/:dealId/submit  — submit F&I package
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { prisma } from "../utils/prisma.js";
import { validateBody, validateParams } from "../utils/validate.js";
import { NotFoundError } from "../utils/errors.js";

function requireTenant(request: { tenant?: { dealerId: string; userId: string; role: string } | null }): { dealerId: string; userId: string; role: string } {
  if (!request.tenant) throw new NotFoundError("Tenant context required");
  return request.tenant;
}

/* ============================================================
 * Types
 * ============================================================ */

type FiProductType = "WARRANTY" | "GAP" | "CREDIT_INSURANCE" | "TIRE_WHEEL" | "RUST";

interface FiProduct {
  id: string;
  dealerId: string;
  name: string;
  productType: FiProductType;
  provider: string | null;
  description: string | null;
  cost: number | null;
  suggestedPrice: number | null;
  termMonths: number | null;
  deductible: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/* ============================================================
 * Default F&I products
 * ============================================================ */

const DEFAULT_FI_PRODUCTS: Array<{
  id: string;
  name: string;
  productType: FiProductType;
  provider: string;
  description: string;
  cost: number;
  suggestedPrice: number;
  termMonths: number | null;
  deductible: number | null;
}> = [
  {
    id: "default_warranty",
    name: "Extended Warranty",
    productType: "WARRANTY",
    provider: "DealerChoice",
    description: "Comprehensive extended warranty coverage",
    cost: 800,
    suggestedPrice: 1495,
    termMonths: 36,
    deductible: 100,
  },
  {
    id: "default_gap",
    name: "GAP Coverage",
    productType: "GAP",
    provider: "DealerChoice",
    description: "Guaranteed Asset Protection - covers the gap between vehicle value and loan balance",
    cost: 350,
    suggestedPrice: 695,
    termMonths: null,
    deductible: null,
  },
  {
    id: "default_tire_wheel",
    name: "Tire & Wheel Protection",
    productType: "TIRE_WHEEL",
    provider: "DealerChoice",
    description: "Coverage for tire and wheel damage from road hazards",
    cost: 199,
    suggestedPrice: 399,
    termMonths: 36,
    deductible: 50,
  },
  {
    id: "default_rust",
    name: "Rust & Undercoating",
    productType: "RUST",
    provider: "DealerChoice",
    description: "Anti-corrosion protection and rust repair coverage",
    cost: 150,
    suggestedPrice: 299,
    termMonths: 60,
    deductible: null,
  },
];

// In-memory custom products store
const customProductsStore = new Map<string, FiProduct>();

/* ============================================================
 * Schemas
 * ============================================================ */

const FiProductIdParamSchema = z.object({
  id: z.string(),
});

const DealIdParamSchema = z.object({
  dealId: z.string().cuid(),
});

const CreateFiProductSchema = z.object({
  name: z.string().trim().min(1).max(120),
  productType: z.enum(["WARRANTY", "GAP", "CREDIT_INSURANCE", "TIRE_WHEEL", "RUST"]),
  provider: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  cost: z.number().min(0).optional(),
  suggestedPrice: z.number().min(0).optional(),
  termMonths: z.number().int().min(1).optional(),
  deductible: z.number().min(0).optional(),
  isActive: z.boolean().default(true),
});

const UpdateFiProductSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  productType: z.enum(["WARRANTY", "GAP", "CREDIT_INSURANCE", "TIRE_WHEEL", "RUST"]).optional(),
  provider: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  cost: z.number().min(0).nullable().optional(),
  suggestedPrice: z.number().min(0).nullable().optional(),
  termMonths: z.number().int().min(1).nullable().optional(),
  deductible: z.number().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
});

const SubmitFiSchema = z.object({
  selectedProducts: z.array(
    z.object({
      productId: z.string(),
      productType: z.enum(["WARRANTY", "GAP", "CREDIT_INSURANCE", "TIRE_WHEEL", "RUST"]).optional(),
      sellingPrice: z.number().min(0),
      termMonths: z.number().int().min(1).optional(),
      deductible: z.number().min(0).optional(),
    }),
  ),
  financing: z
    .object({
      lender: z.string().trim().optional(),
      rate: z.number().min(0).max(30).optional(),
      termMonths: z.number().int().min(1).max(84).optional(),
      monthlyPayment: z.number().min(0).optional(),
    })
    .optional(),
});

/* ============================================================
 * Helpers
 * ============================================================ */

function calculatePayment(principal: number, annualRate: number, termMonths: number): number {
  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) {
    return principal / termMonths;
  }
  const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
  return Math.round(payment * 100) / 100;
}

function generateProductId(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/* ============================================================
 * Routes
 * ============================================================ */

export async function financeRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /fi-products
   * List all F&I products.
   */
  app.get(
    "/fi-products",
    {
      preHandler: [app.authenticate],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const customProducts = Array.from(customProductsStore.values())
        .filter((p) => p.dealerId === ctx.dealerId && p.isActive);

      return reply.status(200).send({
        data: [...DEFAULT_FI_PRODUCTS, ...customProducts.map((p) => ({
          id: p.id,
          name: p.name,
          productType: p.productType,
          provider: p.provider,
          description: p.description,
          cost: p.cost,
          suggestedPrice: p.suggestedPrice,
          termMonths: p.termMonths,
          deductible: p.deductible,
        }))],
      });
    },
  );

  /**
   * POST /fi-products
   * Create a custom F&I product (admin).
   */
  app.post(
    "/fi-products",
    {
      preHandler: [
        app.authenticate,
        app.authorize(["ADMIN", "MANAGER"]),
        validateBody(CreateFiProductSchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const body = request.body as z.infer<typeof CreateFiProductSchema>;

      const product: FiProduct = {
        id: generateProductId(),
        dealerId: ctx.dealerId,
        name: body.name,
        productType: body.productType,
        provider: body.provider ?? null,
        description: body.description ?? null,
        cost: body.cost ?? null,
        suggestedPrice: body.suggestedPrice ?? null,
        termMonths: body.termMonths ?? null,
        deductible: body.deductible ?? null,
        isActive: body.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      customProductsStore.set(product.id, product);

      return reply.status(201).send({
        data: {
          id: product.id,
          name: product.name,
          productType: product.productType,
          provider: product.provider,
          description: product.description,
          cost: product.cost,
          suggestedPrice: product.suggestedPrice,
          termMonths: product.termMonths,
          deductible: product.deductible,
        },
      });
    },
  );

  /**
   * PUT /fi-products/:id
   * Update an F&I product.
   */
  app.put(
    "/fi-products/:id",
    {
      preHandler: [
        app.authenticate,
        app.authorize(["ADMIN", "MANAGER"]),
        validateParams(FiProductIdParamSchema),
        validateBody(UpdateFiProductSchema),
      ],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const { id } = request.params as z.infer<typeof FiProductIdParamSchema>;
      const body = request.body as z.infer<typeof UpdateFiProductSchema>;

      // Check if it's a custom product
      const product = customProductsStore.get(id);
      if (!product || product.dealerId !== ctx.dealerId) {
        return reply.status(404).send({ error: "Product not found" });
      }

      // Apply updates
      if (body.name !== undefined) product.name = body.name;
      if (body.productType !== undefined) product.productType = body.productType;
      if (body.provider !== undefined) product.provider = body.provider;
      if (body.description !== undefined) product.description = body.description;
      if (body.cost !== undefined) product.cost = body.cost;
      if (body.suggestedPrice !== undefined) product.suggestedPrice = body.suggestedPrice;
      if (body.termMonths !== undefined) product.termMonths = body.termMonths;
      if (body.deductible !== undefined) product.deductible = body.deductible;
      if (body.isActive !== undefined) product.isActive = body.isActive;
      product.updatedAt = new Date();

      return reply.status(200).send({
        data: {
          id: product.id,
          name: product.name,
          productType: product.productType,
          provider: product.provider,
          description: product.description,
          cost: product.cost,
          suggestedPrice: product.suggestedPrice,
          termMonths: product.termMonths,
          deductible: product.deductible,
        },
      });
    },
  );

  /**
   * GET /finance/deal/:dealId/options
   * Calculate F&I options for a deal.
   */
  app.get(
    "/deal/:dealId/options",
    {
      preHandler: [app.authenticate, validateParams(DealIdParamSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const { dealId } = request.params as z.infer<typeof DealIdParamSchema>;

      // Get the deal from database using Prisma
      const deal = await prisma.deal.findFirst({
        where: { id: dealId, dealerId: ctx.dealerId },
        include: {
          terms: true,
          vehicle: { include: { pricing: true } },
        },
      });

      if (!deal) {
        throw new NotFoundError("Deal not found");
      }

      const salePrice = deal.terms?.salePrice ?? deal.vehicle?.pricing?.internetPrice ?? deal.vehicle?.pricing?.askingPrice ?? 0;
      const downPayment = deal.terms?.downPayment ?? 0;
      const financedAmount = Math.max(0, salePrice - downPayment);

      const financingOptions = [
        { term: 36, rate: 5.99, monthlyPayment: financedAmount > 0 ? calculatePayment(financedAmount, 5.99, 36) : 0 },
        { term: 48, rate: 6.49, monthlyPayment: financedAmount > 0 ? calculatePayment(financedAmount, 6.49, 48) : 0 },
        { term: 60, rate: 6.99, monthlyPayment: financedAmount > 0 ? calculatePayment(financedAmount, 6.99, 60) : 0 },
        { term: 72, rate: 7.49, monthlyPayment: financedAmount > 0 ? calculatePayment(financedAmount, 7.49, 72) : 0 },
        { term: 84, rate: 7.99, monthlyPayment: financedAmount > 0 ? calculatePayment(financedAmount, 7.99, 84) : 0 },
      ];

      return reply.status(200).send({
        data: {
          products: DEFAULT_FI_PRODUCTS,
          financingOptions,
          dealSummary: {
            salePrice,
            tradeValue: deal.terms?.tradeValue ?? 0,
            tradePayoff: deal.terms?.tradePayoff ?? 0,
            downPayment,
            taxAmount: deal.terms?.taxAmount ?? 0,
            fees: deal.terms?.feeTotal ?? 0,
            financedAmount,
          },
        },
      });
    },
  );

  /**
   * POST /finance/deal/:dealId/submit
   * Submit the F&I package for a deal.
   */
  app.post(
    "/deal/:dealId/submit",
    {
      preHandler: [app.authenticate, validateParams(DealIdParamSchema), validateBody(SubmitFiSchema)],
      config: { requireTenant: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = requireTenant(request);
      const { dealId } = request.params as z.infer<typeof DealIdParamSchema>;
      const body = request.body as z.infer<typeof SubmitFiSchema>;

      const deal = await prisma.deal.findFirst({
        where: { id: dealId, dealerId: ctx.dealerId },
      });

      if (!deal) {
        throw new NotFoundError("Deal not found");
      }

      // Create F&I product records
      const fiProducts: Array<{ id: string; productType: string; sellingPrice: number; termMonths: number | null; deductible: number | null }> = [];

      for (const p of body.selectedProducts) {
        const fiProduct = await prisma.fiProduct.create({
          data: {
            dealId,
            productType: (p.productType ?? "WARRANTY") as "WARRANTY" | "GAP" | "CREDIT_INSURANCE" | "TIRE_WHEEL" | "RUST",
            provider: "DealerChoice",
            sellingPrice: p.sellingPrice,
            termMonths: p.termMonths ?? null,
            deductible: p.deductible ?? null,
          },
        });
        fiProducts.push({
          id: fiProduct.id,
          productType: fiProduct.productType,
          sellingPrice: fiProduct.sellingPrice ?? 0,
          termMonths: fiProduct.termMonths,
          deductible: fiProduct.deductible,
        });
      }

      // Update deal terms with financing info
      if (body.financing) {
        await prisma.dealTerms.upsert({
          where: { dealId },
          create: {
            dealId,
            rate: body.financing.rate ?? null,
            termMonths: body.financing.termMonths ?? null,
            paymentAmount: body.financing.monthlyPayment ?? null,
            lender: body.financing.lender ?? null,
          },
          update: {
            rate: body.financing.rate ?? null,
            termMonths: body.financing.termMonths ?? null,
            paymentAmount: body.financing.monthlyPayment ?? null,
            lender: body.financing.lender ?? null,
          },
        });
      }

      // Update deal status
      await prisma.deal.update({
        where: { id: dealId },
        data: { status: "PENDING_FINANCE" },
      });

      return reply.status(200).send({
        data: {
          dealId,
          fiProducts,
          financing: body.financing,
          submittedAt: new Date().toISOString(),
        },
      });
    },
  );
}

export default financeRoutes;

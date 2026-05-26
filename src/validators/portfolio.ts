import { z } from "zod";

const assetType = z.enum(["STOCK", "CRYPTO", "ETF", "MUTUAL_FUND", "INDEX", "COMMODITY"]);

export const createPortfolioSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    baseCurrency: z.string().trim().length(3).default("USD"),
  }),
});

export const updatePortfolioSchema = z.object({
  params: z.object({ portfolioId: z.string().min(1) }),
  body: createPortfolioSchema.shape.body.partial(),
});

export const portfolioParamsSchema = z.object({
  params: z.object({ portfolioId: z.string().min(1) }),
});

export const holdingParamsSchema = z.object({
  params: z.object({
    portfolioId: z.string().min(1),
    holdingId: z.string().min(1),
  }),
});

export const createHoldingSchema = z.object({
  params: z.object({ portfolioId: z.string().min(1) }),
  body: z.object({
    symbol: z.string().trim().min(1).max(20).transform((v) => v.toUpperCase()),
    name: z.string().trim().min(1).max(160),
    assetType,
    quantity: z.coerce.number().positive(),
    averagePurchasePrice: z.coerce.number().nonnegative(),
    purchaseDate: z.coerce.date(),
    notes: z.string().trim().max(1000).optional(),
  }),
});

export const updateHoldingSchema = z.object({
  params: z.object({
    portfolioId: z.string().min(1),
    holdingId: z.string().min(1),
  }),
  body: z.object({
    quantity: z.coerce.number().positive().optional(),
    averagePurchasePrice: z.coerce.number().nonnegative().optional(),
    purchaseDate: z.coerce.date().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  }),
});

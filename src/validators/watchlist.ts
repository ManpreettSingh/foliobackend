import { z } from "zod";

export const watchlistAssetSchema = z.object({
  body: z.object({
    symbol: z.string().trim().min(1).max(20).transform((v) => v.toUpperCase()),
    name: z.string().trim().min(1).max(160),
    assetType: z.enum(["STOCK", "CRYPTO", "ETF", "MUTUAL_FUND", "INDEX", "COMMODITY"]).default("STOCK"),
  }),
});

export const watchlistParamsSchema = z.object({
  params: z.object({ assetId: z.string().min(1) }),
});

export const searchSchema = z.object({
  query: z.object({ q: z.string().trim().min(1).max(50) }),
});

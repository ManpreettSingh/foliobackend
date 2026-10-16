import type { AssetType } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { getLatestPrice, getLatestPrices } from "./price.service.js";

export async function listWatchlist(userId: string) {
  const rows = await prisma.watchlist.findMany({
    where: { userId },
    include: { asset: true },
    orderBy: { createdAt: "desc" },
  });
  const quotes = await getLatestPrices(rows.map((row) => row.asset.symbol));
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));

  // Heal assets saved before currency was resolved (they defaulted to USD),
  // so INR-quoted stocks are not multiplied by the USD->INR rate later on.
  for (const row of rows) {
    const quote = quoteMap.get(row.asset.symbol);
    if (quote?.currency && row.asset.currency !== quote.currency) {
      row.asset.currency = quote.currency;
      prisma.asset
        .update({ where: { id: row.asset.id }, data: { currency: quote.currency } })
        .catch((err) => console.error(`Failed to update asset currency for ${row.asset.symbol}:`, err));
    }
  }

  return rows.map((row) => ({ ...row, quote: quoteMap.get(row.asset.symbol) }));
}

export async function addWatchlistAsset(userId: string, input: { symbol: string; name: string; assetType: AssetType }) {
  // Resolve the currency the quote is actually priced in (INR for NSE/BSE stocks).
  // Without it the asset falls back to the schema default of USD.
  let currency: string | undefined;
  try {
    const quote = await getLatestPrice(input.symbol);
    currency = quote?.currency || undefined;
  } catch (err) {
    console.error(`Failed to resolve currency for ${input.symbol}:`, err);
  }

  const asset = await prisma.asset.upsert({
    where: { symbol_type: { symbol: input.symbol, type: input.assetType } },
    create: { symbol: input.symbol, name: input.name, type: input.assetType, ...(currency ? { currency } : {}) },
    update: { name: input.name, ...(currency ? { currency } : {}) },
  });
  return prisma.watchlist.upsert({
    where: { userId_assetId: { userId, assetId: asset.id } },
    create: { userId, assetId: asset.id },
    update: {},
    include: { asset: true },
  });
}

export async function removeWatchlistAsset(userId: string, assetId: string) {
  await prisma.watchlist.delete({ where: { userId_assetId: { userId, assetId } } });
}

export async function searchAssets(query: string) {
  return prisma.asset.findMany({
    where: {
      OR: [
        { symbol: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
      ],
    },
    take: 20,
    orderBy: { symbol: "asc" },
  });
}

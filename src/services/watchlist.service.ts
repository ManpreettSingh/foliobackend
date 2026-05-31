import type { AssetType } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { getLatestPrices } from "./price.service.js";

export async function listWatchlist(userId: string) {
  const rows = await prisma.watchlist.findMany({
    where: { userId },
    include: { asset: true },
    orderBy: { createdAt: "desc" },
  });
  const quotes = await getLatestPrices(rows.map((row) => row.asset.symbol));
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));
  return rows.map((row) => ({ ...row, quote: quoteMap.get(row.asset.symbol) }));
}

export async function addWatchlistAsset(userId: string, input: { symbol: string; name: string; assetType: AssetType }) {
  const asset = await prisma.asset.upsert({
    where: { symbol_type: { symbol: input.symbol, type: input.assetType } },
    create: { symbol: input.symbol, name: input.name, type: input.assetType },
    update: { name: input.name },
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

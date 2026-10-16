import type { AssetType } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { HttpError } from "../utils/http-error.js";
import { convertCurrency } from "../config/fx.js";
import { getLatestPrice, getLatestPrices } from "./price.service.js";

async function assertPortfolioOwner(portfolioId: string, userId: string) {
  const portfolio = await prisma.portfolio.findFirst({ where: { id: portfolioId, userId } });
  if (!portfolio) throw new HttpError(404, "Portfolio not found");
  return portfolio;
}

function toNumber(value: unknown) {
  return Number(value);
}

function toUsd(value: number, currency?: string | null): number {
  return convertCurrency(value, currency, "USD");
}

export async function listPortfolios(userId: string) {
  return prisma.portfolio.findMany({
    where: { userId },
    include: { holdings: { include: { asset: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function createPortfolio(userId: string, input: { name: string; description?: string; baseCurrency: string }) {
  return prisma.portfolio.create({ data: { ...input, userId } });
}

export async function updatePortfolio(userId: string, portfolioId: string, input: Partial<{ name: string; description: string; baseCurrency: string }>) {
  await assertPortfolioOwner(portfolioId, userId);
  return prisma.portfolio.update({ where: { id: portfolioId }, data: input });
}

export async function deletePortfolio(userId: string, portfolioId: string) {
  await assertPortfolioOwner(portfolioId, userId);
  await prisma.portfolio.delete({ where: { id: portfolioId } });
}

export async function addHolding(
  userId: string,
  portfolioId: string,
  input: {
    symbol: string;
    name: string;
    assetType: AssetType;
    quantity: number;
    averagePurchasePrice: number;
    purchaseDate: Date;
    notes?: string;
  },
) {
  await assertPortfolioOwner(portfolioId, userId);

  // Only overwrite the stored currency when the quote actually reports one.
  // A failed quote must not replace a known INR asset with the USD default.
  let currency: string | undefined;
  try {
    const quote = await getLatestPrice(input.symbol);
    if (quote && quote.currency) {
      currency = quote.currency;
    }
  } catch (err) {
    console.error(`Failed to resolve currency for ${input.symbol}:`, err);
  }

  const asset = await prisma.asset.upsert({
    where: { symbol_type: { symbol: input.symbol, type: input.assetType } },
    create: { symbol: input.symbol, name: input.name, type: input.assetType, currency: currency ?? "USD" },
    update: { name: input.name, ...(currency ? { currency } : {}) },
  });

  // Check if holding already exists for this asset in the portfolio
  const existingHolding = await prisma.holding.findFirst({
    where: { portfolioId, assetId: asset.id }
  });

  if (existingHolding) {
    const existingQty = Number(existingHolding.quantity);
    const existingPrice = Number(existingHolding.averagePurchasePrice);
    const newQty = input.quantity;
    const newPrice = input.averagePurchasePrice;

    const combinedQty = existingQty + newQty;
    const combinedPrice = combinedQty > 0 ? (existingQty * existingPrice + newQty * newPrice) / combinedQty : 0;

    return prisma.holding.update({
      where: { id: existingHolding.id },
      data: {
        quantity: combinedQty,
        averagePurchasePrice: combinedPrice,
        purchaseDate: input.purchaseDate, // update to latest purchase date
        notes: [existingHolding.notes, input.notes].filter(Boolean).join(" | ").slice(0, 1000),
        transactions: {
          create: {
            portfolioId,
            assetId: asset.id,
            type: "BUY",
            quantity: newQty,
            price: newPrice,
            occurredAt: input.purchaseDate,
            notes: input.notes
          }
        }
      },
      include: { asset: true }
    });
  }

  return prisma.holding.create({
    data: {
      portfolioId,
      assetId: asset.id,
      quantity: input.quantity,
      averagePurchasePrice: input.averagePurchasePrice,
      purchaseDate: input.purchaseDate,
      notes: input.notes,
      transactions: {
        create: {
          portfolioId,
          assetId: asset.id,
          type: "BUY",
          quantity: input.quantity,
          price: input.averagePurchasePrice,
          occurredAt: input.purchaseDate,
          notes: input.notes
        }
      }
    },
    include: { asset: true },
  });
}

export async function updateHolding(
  userId: string,
  portfolioId: string,
  holdingId: string,
  input: Partial<{ quantity: number; averagePurchasePrice: number; purchaseDate: Date; notes: string | null }>,
) {
  await assertPortfolioOwner(portfolioId, userId);
  const holding = await prisma.holding.findFirst({ where: { id: holdingId, portfolioId } });
  if (!holding) throw new HttpError(404, "Holding not found");
  
  return prisma.holding.update({ 
    where: { id: holdingId }, 
    data: {
      ...input,
      transactions: {
        create: {
          portfolioId,
          assetId: holding.assetId,
          type: "EDIT",
          quantity: input.quantity ?? holding.quantity,
          price: input.averagePurchasePrice ?? holding.averagePurchasePrice,
          occurredAt: input.purchaseDate ?? holding.purchaseDate,
          notes: input.notes ?? undefined
        }
      }
    }, 
    include: { asset: true } 
  });
}

export async function deleteHolding(userId: string, portfolioId: string, holdingId: string) {
  await assertPortfolioOwner(portfolioId, userId);
  // Scope to the verified portfolio so one user cannot delete another user's holding.
  const holding = await prisma.holding.findFirst({ where: { id: holdingId, portfolioId } });
  if (!holding) throw new HttpError(404, "Holding not found");

  await prisma.transaction.create({
    data: {
      portfolioId,
      assetId: holding.assetId,
      type: "SELL",
      quantity: holding.quantity,
      price: holding.averagePurchasePrice,
      occurredAt: new Date(),
      notes: "Removed from portfolio"
    }
  });
  await prisma.holding.delete({ where: { id: holdingId } });
}

export async function getDashboard(userId: string) {
  const portfolios = await prisma.portfolio.findMany({
    where: { userId },
    include: { holdings: { include: { asset: true } } },
  });

  const holdings = portfolios.flatMap((portfolio) =>
    portfolio.holdings.map((holding) => ({ ...holding, portfolioName: portfolio.name })),
  );
  const quotes = await getLatestPrices([...new Set(holdings.map((holding) => holding.asset.symbol))]);
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));

  let investedAmount = 0;
  let totalPortfolioValue = 0;
  let todaysGainLoss = 0;
  const allocation = new Map<string, number>();

  const enrichedHoldings = holdings.map((holding) => {
    const quantity = toNumber(holding.quantity);
    const avgPrice = toNumber(holding.averagePurchasePrice);
    const quote = quoteMap.get(holding.asset.symbol);
    // A failed lookup yields price 0; treat that as "no price" instead of a worthless holding.
    const currentPrice = quote && quote.price > 0 ? quote.price : avgPrice;

    // Auto-update asset currency in background if quote has a valid currency
    if (quote && quote.currency && holding.asset.currency !== quote.currency) {
      holding.asset.currency = quote.currency;
      prisma.asset.update({
        where: { id: holding.asset.id },
        data: { currency: quote.currency },
      }).catch((err) => console.error(`Failed to update asset currency in bg for ${holding.asset.symbol}:`, err));
    }

    const assetCurrency = holding.asset.currency || "USD";

    const invested = quantity * avgPrice;
    const currentValue = quantity * currentPrice;
    const unrealizedProfitLoss = currentValue - invested;
    // Normalize to USD so cross-currency aggregation (summary, allocation) is correct
    const investedUsd = toUsd(invested, assetCurrency);
    const currentValueUsd = toUsd(currentValue, assetCurrency);
    const unrealizedPLUsd = currentValueUsd - investedUsd;
    investedAmount += investedUsd;
    totalPortfolioValue += currentValueUsd;
    todaysGainLoss += currentValueUsd * ((quote?.changePercent ?? 0) / 100);
    allocation.set(holding.asset.type, (allocation.get(holding.asset.type) ?? 0) + currentValueUsd);
    return { ...holding, currentPrice, invested: investedUsd, currentValue: currentValueUsd, unrealizedProfitLoss: unrealizedPLUsd };
  });

  const latestTransactions = await prisma.transaction.findMany({
    where: { portfolio: { userId } },
    include: { asset: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return {
    totalPortfolioValue,
    investedAmount,
    todaysGainLoss,
    allocation: Array.from(allocation, ([name, value]) => ({ name, value })),
    holdingsCount: enrichedHoldings.length,
    holdings: enrichedHoldings.sort((a, b) => b.currentValue - a.currentValue),
    transactions: latestTransactions,
  };
}

export async function getHoldingQuote(symbol: string) {
  return getLatestPrice(symbol);
}

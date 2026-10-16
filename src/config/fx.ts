// Manual exchange rates (units per 1 USD). Single source of truth for the backend so
// portfolio aggregation and the AI report cannot drift apart.
export const USD_RATES: Record<string, number> = {
  USD: 1,
  INR: 83.5,
  EUR: 0.93,
  GBP: 0.79,
  JPY: 158.0,
};

export function convertCurrency(value: number, from?: string | null, to = "USD"): number {
  const fromRate = USD_RATES[(from || "USD").toUpperCase()] ?? 1;
  const toRate = USD_RATES[to.toUpperCase()] ?? 1;
  return fromRate > 0 ? (value / fromRate) * toRate : value;
}

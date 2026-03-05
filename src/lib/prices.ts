// src/lib/prices.ts
import { db, type PriceSnapshot } from "@/lib/db";

function todayISODateLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function mapToFetchSymbol(userTickerRaw: string) {
  const t = userTickerRaw.trim().toUpperCase();
  // Keep user tickers as-is; server route handles mapping
  return { userTicker: t, fetchSymbol: t };
}

async function fetchQuoteProxy(userTickers: string[]) {
  const url = `/api/quotes?symbols=${encodeURIComponent(userTickers.join(","))}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Quote proxy failed (${res.status}) ${txt}`);
  }
  const json = await res.json();
  return (json?.prices ?? {}) as Record<string, number>; // USER ticker -> price
}

export async function getLatestPrice(ticker: string): Promise<number | null> {
  const t = ticker.trim().toUpperCase();

  const snaps = await db.priceSnapshots
    .where("ticker")
    .equals(t)
    .toArray();

  if (!snaps.length) return null;

  // pick newest by date (YYYY-MM-DD)
  let best = snaps[0];
  for (const s of snaps) {
    if (s.date > best.date) best = s;
  }

  return best.closePrice ?? null;
}

export async function refreshPricesOnceDaily(userTickersRaw: string[]) {
  const date = todayISODateLocal();

  // user tickers de-dupe
  const userTickers = Array.from(
    new Set(userTickersRaw.map((t) => t.trim().toUpperCase()).filter(Boolean))
  );

  if (userTickers.length === 0) return { didRefresh: false, stored: 0 };

  // already stored today?
  const existingToday = await db.priceSnapshots.where("date").equals(date).toArray();
  const existingSet = new Set(existingToday.map((s) => s.ticker.toUpperCase()));
  const missing = userTickers.filter((t) => !existingSet.has(t));

  if (missing.length === 0) return { didRefresh: false, stored: 0 };

  // map to fetch symbols
  const mapped = missing.map(mapToFetchSymbol);
  const fetchSymbols = Array.from(new Set(mapped.map((m) => m.fetchSymbol.toUpperCase())));

  const priceMap = await fetchQuoteProxy(fetchSymbols);

const rows: PriceSnapshot[] = [];
for (const t of missing) {
  const p = priceMap[t.toUpperCase()];
  if (typeof p === "number") rows.push({ ticker: t.toUpperCase(), date, closePrice: p });
}

  if (rows.length) {
    await db.priceSnapshots.bulkPut(rows);
  }

  return { didRefresh: true, stored: rows.length };
}
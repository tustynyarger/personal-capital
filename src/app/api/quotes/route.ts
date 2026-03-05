// src/app/api/quotes/route.ts
import { NextResponse } from "next/server";

// -------- Crypto (CoinGecko) --------
async function fetchCoinGeckoUSD(ids: string[]) {
  const out: Record<string, number> = {};
  if (ids.length === 0) return out;

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
    ids.join(",")
  )}&vs_currencies=usd`;

  const r = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
  });

  if (!r.ok) return out;

  const json = await r.json();
  for (const id of ids) {
    const usd = json?.[id]?.usd;
    if (typeof usd === "number") out[id] = usd;
  }
  return out;
}

// -------- Stocks/ETFs (Alpha Vantage FREE endpoint) --------
function latestDateKey(obj: Record<string, any>) {
  const keys = Object.keys(obj);
  keys.sort();
  return keys[keys.length - 1];
}

async function fetchAlphaVantageDailyClose(symbol: string, apiKey: string) {
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(
    symbol
  )}&outputsize=compact&apikey=${encodeURIComponent(apiKey)}`;

  const r = await fetch(url, { cache: "no-store" });
  const json = await r.json().catch(() => ({}));

  const note = json?.Note || json?.Information || json?.["Error Message"];
  if (note) return { close: null as number | null, note: String(note) };

  const ts = json?.["Time Series (Daily)"];
  if (!ts) return { close: null as number | null, note: "No Time Series (Daily) in response" };

  const d = latestDateKey(ts);
  const closeRaw = ts?.[d]?.["4. close"];
  const close = Number(closeRaw);
  if (Number.isNaN(close)) return { close: null as number | null, note: "Close parse failed" };

  return { close, note: null as string | null };
}

// -------- GOLD (Stooq historical latest close) --------
async function fetchStooqLatestClose(symbol: string) {
  // Uses historical endpoint: /q/d/l/ which is more reliable than /q/l/
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;

  const r = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0", Accept: "text/csv,*/*" },
  });

  if (!r.ok) return null;

  const text = (await r.text()).trim();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Date,Open,High,Low,Close,Volume
  if (lines.length < 2) return null;
  const header = lines[0].toLowerCase();
  if (!header.includes("date") || !header.includes("close")) return null;

  const row = lines[1].split(",");
  const closeRaw = row[4];
  const close = Number(closeRaw);
  if (Number.isNaN(close)) return null;

  return close;
}

export async function GET(req: Request) {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing ALPHA_VANTAGE_API_KEY in .env.local" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get("symbols") || "";
  const userTickers = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (userTickers.length === 0) return NextResponse.json({ prices: {} }, { status: 200 });

  const prices: Record<string, number> = {};
  const warnings: Record<string, string> = {};

  const cryptoIds: Array<{ user: string; id: string }> = [];
  const equities: string[] = [];
  let wantsGold = false;

  for (const t of userTickers) {
    if (t === "BTC") cryptoIds.push({ user: "BTC", id: "bitcoin" });
    else if (t === "ETH") cryptoIds.push({ user: "ETH", id: "ethereum" });
    else if (t === "GOLD") wantsGold = true;
    else equities.push(t);
  }

  // Equities/ETFs via Alpha Vantage (sequential = respects rate limits)
  for (const sym of Array.from(new Set(equities))) {
    const r = await fetchAlphaVantageDailyClose(sym, apiKey);
    if (typeof r.close === "number") prices[sym] = r.close;
    else if (r.note) warnings[sym] = r.note;
  }

  // GOLD via Stooq (no key, avoids AV quota)
 if (wantsGold) {
  const cg = await fetchCoinGeckoUSD(["pax-gold"]);
  const g = cg["pax-gold"];
  if (typeof g === "number") prices["GOLD"] = g;
  else warnings["GOLD"] = "CoinGecko gold fetch failed";
}

  // Crypto via CoinGecko
  const ids = Array.from(new Set(cryptoIds.map((x) => x.id)));
  const cg = await fetchCoinGeckoUSD(ids);
  for (const c of cryptoIds) {
    const v = cg[c.id];
    if (typeof v === "number") prices[c.user] = v;
  }

  return NextResponse.json(
    Object.keys(warnings).length ? { prices, warnings } : { prices },
    { status: 200 }
  );
}
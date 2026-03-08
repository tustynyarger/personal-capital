"use client";


import Link from "next/link";

import { useEffect, useMemo, useState } from "react";

import { useLiveQuery } from "dexie-react-hooks";

import { ManualPriceEditor } from "@/components/ManualPriceEditor";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

import {

db,

isoNow,

monthKeyFromISO,

type Account,

type Transaction,

type WealthHistory,

} from "@/lib/db";

import { getLatestPrice, getManualPriceOverrides, refreshPricesOnceDaily } from "@/lib/prices";

import { NavMenu } from "@/components/NavMenu";



function money(n: number) {

return n.toLocaleString(undefined, {

minimumFractionDigits: 2,

maximumFractionDigits: 2,

 });

}



type HoldingView = {

accountId: string;

accountName: string;

accountType: string;

ticker: string;

quantity: number;

avgCost: number;

currentPrice: number | null;

marketValue: number | null;

costBasis: number;

unrealizedPnl: number | null;

};



export default function CapitalPage() {

  if (typeof window !== "undefined") (window as any).db = db;

const accounts =

useLiveQuery(async () => db.accounts.toArray(), []) ?? [];

const assets =
useLiveQuery(async () => db.assets.toArray(), []) ?? [];


const txs =

useLiveQuery(

async () =>

db.transactions.orderBy("effectiveDate").toArray(),

[]

 ) ?? [];



const lots =

useLiveQuery(async () => db.holdingLots.toArray(), []) ?? [];

useEffect(() => {
  const run = async () => {
    try {
      const tickers = Array.from(new Set(lots.map(l => l.ticker)));
      if (tickers.length) {
        await refreshPricesOnceDaily(tickers);
      }
    } catch (err) {
      console.warn("Price refresh failed", err);
    }
  };

  run();
}, [lots]);

const priceSnapshots =

useLiveQuery(async () => db.priceSnapshots.toArray(), []) ?? [];



const wealthHistory =

useLiveQuery<WealthHistory[]>(async () => db.wealth_history.orderBy("date").toArray(), []) ??

[];



const [exportText, setExportText] = useState<string | null>(null);

const [goldPrice, setGoldPrice] = useState<number | null>(null);



// Compute cash balances per account reusing the same rules as operations

const accountCash = useMemo(() => {

const map: Record<string, number> = {};

for (const a of accounts) {

map[a.id] = 0;

 }

for (const t of txs) {

if (!map[t.accountId] && map[t.accountId] !== 0) continue;

switch (t.type) {

case "income":

map[t.accountId] += t.amount;

break;

case "expense":

map[t.accountId] -= t.amount;

break;

case "transfer":

if (t.toAccountId) {

map[t.accountId] -= t.amount;

map[t.toAccountId] += t.amount;

 }

break;

case "buy":

map[t.accountId] -= (t.quantity ?? 0) * (t.price ?? 0);

break;

case "sell":

map[t.accountId] += (t.quantity ?? 0) * (t.price ?? 0);

break;

 }

 }

return map;

 }, [accounts, txs]);



// Aggregate holdings from lots

const rawHoldings = useMemo(() => {

const map: Record<string, { accountId: string; ticker: string; quantity: number; totalCost: number }> =

 {};

for (const lot of lots) {

const key = `${lot.accountId}_${lot.ticker}`;

if (!map[key]) {

map[key] = {

accountId: lot.accountId,

ticker: lot.ticker,

quantity: 0,

totalCost: 0,

 };

 }

map[key].quantity += lot.quantityRemaining;

map[key].totalCost += lot.quantityRemaining * lot.unitCost;

 }

return Object.values(map);

 }, [lots]);



// Price lookup helper from in-memory snapshots

const latestPriceByTicker = useMemo(() => {
  const byTicker: Record<string, { date: string; price: number }> = {};

  for (const snap of priceSnapshots) {
    const t = snap.ticker.toUpperCase();
    if (!byTicker[t] || snap.date > byTicker[t].date) {
      byTicker[t] = { date: snap.date, price: snap.closePrice };
    }
  }

  return (ticker: string): number | null => {
    const t = ticker.toUpperCase();

    const manual = getManualPriceOverrides?.()[t];
    if (typeof manual === "number") return manual;

    const row = byTicker[t];
    return row ? row.price : null;
  };
}, [priceSnapshots]);



const holdings: HoldingView[] = useMemo(() => {

return rawHoldings.map((h) => {

const account = accounts.find((a) => a.id === h.accountId);

const currentPrice = latestPriceByTicker(h.ticker);

const costBasis = h.totalCost;

const marketValue =

currentPrice != null ? currentPrice * h.quantity : null;

const unrealizedPnl =

marketValue != null ? marketValue - costBasis : null;



return {

accountId: h.accountId,

accountName: account?.name ?? "Unknown",

accountType: account?.type ?? "",

ticker: h.ticker,

quantity: h.quantity,

avgCost: h.quantity > 0 ? h.totalCost / h.quantity : 0,

currentPrice,

marketValue,

costBasis,

unrealizedPnl,

 };

 });

 }, [rawHoldings, accounts, latestPriceByTicker]);



const totalCashAssets = useMemo(

 () =>

accounts

 .filter((a) => a.type === "cash")

 .reduce((sum, a) => sum + (accountCash[a.id] ?? 0), 0),

[accounts, accountCash]

 );



const totalInvestmentAssets = useMemo(

 () =>

holdings.reduce(

 (sum, h) => sum + (h.marketValue ?? h.costBasis ?? 0),

0

 ),

[holdings]

 );



 const otherAssetsTotal = assets.reduce((s, a) => s + (a.value ?? 0), 0);

 const totalAssets =
   totalCashAssets +
   totalInvestmentAssets +
   otherAssetsTotal;

const totalLiabilities = useMemo(

 () =>

accounts

 .filter((a) => a.type === "debt")

 .reduce((sum, a) => sum + (accountCash[a.id] ?? 0), 0),

[accounts, accountCash]

 );



const netWorth = totalAssets - totalLiabilities;

// Persist a single net worth entry per day in IndexedDB.

useEffect(() => {

if (!accounts.length) return;



const today = new Date().toISOString().slice(0, 10);



const record = async () => {

try {

const existing = await db.wealth_history

 .where("date")

 .equals(today)

 .first();



if (!existing) {

await db.wealth_history.add({ date: today, netWorth });

 } else if (existing.netWorth !== netWorth && existing.id != null) {

await db.wealth_history.update(existing.id, { netWorth });

 }

 } catch {

// best-effort persistence; ignore failures

 }

 };



void record();

 }, [accounts.length, netWorth]);



// Net worth history for charting (one point per day).

const netWorthSeries = useMemo(

 () =>

wealthHistory

 .slice()

 .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

 .map((row) => ({ date: row.date, value: row.netWorth })),

[wealthHistory]

 );



// Simple SVG line chart

const chartViewBox = "0 0 320 180";

const chartPath = useMemo(() => {

if (!netWorthSeries.length) return "";

const values = netWorthSeries.map((p) => p.value);

const min = Math.min(...values);

const max = Math.max(...values);

const span = max - min || 1;

const width = 280;

const height = 130;

return netWorthSeries

 .map((p, i) => {

const x =

 (netWorthSeries.length === 1

? width / 2

: (i / (netWorthSeries.length - 1)) * width) + 20;

const y = height - ((p.value - min) / span) * height + 20;

return `${i === 0 ? "M" : "L"} ${x} ${y}`;

 })

 .join(" ");

 }, [netWorthSeries]);



// Gold price: use latest snapshot if available, otherwise fetch once.

useEffect(() => {

const existingPrice = latestPriceByTicker("GOLD");

if (existingPrice != null) {

setGoldPrice(existingPrice);

return;

 }



let cancelled = false;

const fetchPrice = async () => {

try {

const p = await getLatestPrice("GOLD");

if (!cancelled && p != null) {

setGoldPrice(p);

 }

 } catch {

if (!cancelled) {

setGoldPrice(null);

 }

 }

 };



void fetchPrice();



return () => {

cancelled = true;

 };

 }, [latestPriceByTicker]);



const goldHolding = useMemo(

 () =>

holdings.find((h) => h.ticker.toUpperCase() === "GOLD") ?? null,

[holdings]

 );



const goldQuantityOz = goldHolding?.quantity ?? 0;

const goldSpotPrice = goldPrice ?? goldHolding?.currentPrice ?? null;

const goldMarketValue =

goldSpotPrice != null ? goldSpotPrice * goldQuantityOz : goldHolding?.marketValue ?? 0;



const cashAccount = useMemo(

 () =>

accounts.find((a) => a.name.toLowerCase() === "cash") ?? null,

[accounts]

 );



const depositAccount = useMemo(

 () =>

accounts.find((a) =>

a.name.toLowerCase().includes("security deposit")

 ) ?? null,

[accounts]

 );



const brokerageAccounts = useMemo(

 () => accounts.filter((a) => a.type === "brokerage"),

[accounts]

 );



const rothAccounts = useMemo(

 () => accounts.filter((a) => a.type === "roth"),

[accounts]

 );



const brokerageHoldings = useMemo(() => {

const ids = new Set(brokerageAccounts.map((a) => a.id));

return holdings.filter((h) => ids.has(h.accountId));

 }, [brokerageAccounts, holdings]);



const rothHoldings = useMemo(() => {

const ids = new Set(rothAccounts.map((a) => a.id));

return holdings.filter((h) => ids.has(h.accountId));

 }, [rothAccounts, holdings]);



const accountValue = (account: Account | null) =>

account ? accountCash[account.id] ?? 0 : 0;



const brokerageTotal = brokerageHoldings.reduce(

 (sum, h) => sum + (h.marketValue ?? h.costBasis ?? 0),

0

 );



const rothTotal = rothHoldings.reduce(

 (sum, h) => sum + (h.marketValue ?? h.costBasis ?? 0),

0

 );



const dailyChange = useMemo(() => {

if (netWorthSeries.length < 2) return 0;

const last = netWorthSeries[netWorthSeries.length - 1];

const prev = netWorthSeries[netWorthSeries.length - 2];

return last.value - prev.value;

 }, [netWorthSeries]);



const totalInvested = brokerageTotal + rothTotal;

const realEstateTotal = assets
  .filter((a) => a.category === "real_estate")
  .reduce((s, a) => s + (a.value ?? 0), 0);

const nonRealEstateAssetsTotal = assets
  .filter((a) => a.category !== "real_estate")
  .reduce((s, a) => s + (a.value ?? 0), 0);

  const allocationData = [
    { name: "Stocks", value: brokerageTotal + rothTotal },
    { name: "Real Estate", value: realEstateTotal },
    { name: "Cash", value: totalCashAssets },
    { name: "Gold", value: goldMarketValue },
    { name: "Other", value: nonRealEstateAssetsTotal },
  ].filter((a) => a.value > 0);
  
const COLORS = ["#111111", "#4ade80", "#facc15", "#60a5fa"];

// Monthly cashflow (for export snapshot only)

const monthKey = monthKeyFromISO(isoNow());

const monthTxs = useMemo(

 () =>

txs.filter((t) => monthKeyFromISO(t.effectiveDate) === monthKey),

[txs, monthKey]

 );



const monthlyRevenue = useMemo(

 () =>

monthTxs

 .filter((t) => t.type === "income")

 .reduce((s, t) => s + t.amount, 0),

[monthTxs]

 );



const monthlyExpenses = useMemo(

 () =>

monthTxs

 .filter(

 (t) =>

t.type === "expense" &&

cashAccount &&

t.accountId === cashAccount.id

 )

 .reduce((s, t) => s + t.amount, 0),

[monthTxs, cashAccount]

 );



const monthlyNet = monthlyRevenue - monthlyExpenses;



// Export snapshot builder

const onExport = () => {

const cash = totalCashAssets;



const brokerageIds = accounts

 .filter((a) => a.type === "brokerage")

 .map((a) => a.id);

const rothIds = accounts

 .filter((a) => a.type === "roth")

 .map((a) => a.id);

const cryptoIds = accounts

 .filter((a) => a.type === "crypto")

 .map((a) => a.id);



const brokerageValue = holdings

 .filter((h) => brokerageIds.includes(h.accountId))

 .reduce((s, h) => s + (h.marketValue ?? h.costBasis ?? 0), 0);



const rothValue = holdings

 .filter((h) => rothIds.includes(h.accountId))

 .reduce((s, h) => s + (h.marketValue ?? h.costBasis ?? 0), 0);



const cryptoValue = holdings

 .filter((h) => cryptoIds.includes(h.accountId))

 .reduce((s, h) => s + (h.marketValue ?? h.costBasis ?? 0), 0);



const lines: string[] = [];

lines.push("ASSETS");

lines.push(`Cash: $${money(cash)}`);

lines.push(`Brokerage: $${money(brokerageValue)}`);

lines.push(`Roth: $${money(rothValue)}`);

lines.push(`Crypto: $${money(cryptoValue)}`);

lines.push("");

lines.push("LIABILITIES");

lines.push(

totalLiabilities ? `$${money(totalLiabilities)}` : "None"

 );

lines.push("");

lines.push("MONTHLY CASHFLOW");

lines.push(`Revenue: $${money(monthlyRevenue)}`);

lines.push(`Expenses: $${money(monthlyExpenses)}`);

lines.push(`Net: $${money(monthlyNet)}`);

lines.push("");

lines.push("INVESTMENTS");

if (!holdings.length) {

lines.push("None");

 } else {

for (const h of holdings) {

const mv = h.marketValue ?? h.costBasis ?? 0;

lines.push(

`${h.ticker}: ${h.quantity.toFixed(4)} shares ($${money(mv)})`

 );

 }

 }



setExportText(lines.join("\n"));

 };



return (

<main className="min-h-screen bg-white text-black">

<NavMenu title="Capital" />

<div className="mx-auto max-w-4xl px-4 pb-24 pt-6 sm:px-6">

<section className="rounded-2xl border bg-white p-4 sm:p-5">

<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

<div>

<h1 className="text-xl font-semibold tracking-tight sm:text-2xl">

 Net Worth

</h1>

<p className="mt-1 text-xs text-zinc-500">

 Snapshot of your assets and investments.

</p>

</div>

<button

onClick={onExport}

className="mt-2 inline-flex items-center justify-center rounded-xl border px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 sm:mt-0"

>

 Export Financial Snapshot

</button>

</div>



<div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">

<KPI label="Net Worth" value={`$${money(netWorth)}`} />

<KPI

label="Daily Change"

value={`${dailyChange >= 0 ? "+" : "-"}$${money(Math.abs(dailyChange))}`}

/>

<KPI

label="Total Invested"

value={`$${money(totalInvested)}`}

/>

</div>

</section>



<section className="mt-6 rounded-2xl border bg-white p-4 sm:p-5">

<div className="flex items-center justify-between">

<h2 className="text-sm font-medium text-zinc-900">

 Accounts

</h2>

</div>

<div className="mt-4 grid grid-cols-1 gap-3">

<AccountCard

title="Cash"

value={money(accountValue(cashAccount))}

subtitle={cashAccount?.name ?? "Cash account"}

/>

<AccountCard

title="Brokerage"

value={money(brokerageTotal)}

holdings={brokerageHoldings}

/>

<AccountCard

title="Roth"

value={money(rothTotal)}

holdings={rothHoldings}

/>

<AccountCard

title="Gold"

value={money(goldMarketValue)}

subtitle={`${goldQuantityOz.toFixed(3)} oz`}

/>

<AccountCard

title="Security Deposit"

value={money(accountValue(depositAccount))}

subtitle={depositAccount?.name ?? "Rental security deposit"}

/>

</div>

</section>

{assets.map((a) => (
  <AccountCard
    key={a.id}
    title={a.name}
    value={money(a.value ?? 0)}
    subtitle={a.category}
  />
))}

<section className="mt-6 rounded-2xl border bg-white p-4 sm:p-5">
  <h2 className="text-sm font-medium text-zinc-900">
    Portfolio Allocation
  </h2>

  <div className="mt-6 flex flex-col items-center gap-4">

    <div className="w-full max-w-xs">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={allocationData}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            stroke="none"
          >
            {allocationData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>

    <div className="w-full max-w-xs space-y-2">
      {allocationData.map((item, i) => {
        const total = allocationData.reduce((s, a) => s + a.value, 0);
        const percent = ((item.value / total) * 100).toFixed(0);

        return (
          <div
            key={item.name}
            className="flex items-center justify-between text-sm"
          >
            <div className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              {item.name}
            </div>

            <div className="text-zinc-500">
              {percent}%
            </div>
          </div>
        );
      })}
    </div>

  </div>
</section>

<section className="mt-6 rounded-2xl border bg-white p-4 sm:p-5">
  <div className="flex items-center justify-between">
    <h2 className="text-sm font-medium text-zinc-900">
      Net Worth Over Time
    </h2>

    <p className="text-xs text-zinc-500">
      Date vs. net worth
    </p>
  </div>

  {netWorthSeries.length === 0 ? (
    <div className="mt-4 text-sm text-zinc-500">
      No history yet. Come back tomorrow to see your first data point.
    </div>
  ) : (
    <div className="mt-4">
      <svg
        viewBox={chartViewBox}
        className="h-64 w-full text-zinc-900"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient
            id="networth-fill"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.12" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {chartPath && (
          <>
            <path
              d={`${chartPath} L 300 170 L 20 170 Z`}
              fill="url(#networth-fill)"
              stroke="none"
            />

            <path
              d={chartPath}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        )}

        <text
          x="22"
          y="24"
          className="fill-zinc-400 text-[10px]"
        >
          Net Worth
        </text>

        <text
          x="300"
          y="172"
          textAnchor="end"
          className="fill-zinc-400 text-[10px]"
        >
          Date
        </text>
      </svg>
    </div>
  )}
</section>

{exportText && (

<section className="mt-6 rounded-2xl border bg-white">
<div className="border-b px-4 py-3 text-sm font-medium">
  Export Financial Snapshot
</div>
<div className="space-y-2 px-4 py-3">

<p className="text-xs text-zinc-500">

 Copy this text and paste it into ChatGPT to ask for

 financial advice.

</p>

<textarea

value={exportText}

readOnly

className="mt-1 h-40 w-full rounded-xl border px-3 py-2 text-xs font-mono"

/>

</div>

</section>

 )}
<ManualPriceEditor />
</div>

</main>

 );

}



function KPI(props: { label: string; value: string }) {

return (

<div className="rounded-2xl border p-4">

<div className="text-xs text-zinc-500">{props.label}</div>

<div className="mt-2 text-xl font-semibold tabular-nums">

{props.value}

</div>

</div>

 );

}



function AccountCard(props: {

title: string;

value: string;

subtitle?: string;

holdings?: HoldingView[];

}) {

const { title, value, subtitle, holdings } = props;

const [expanded, setExpanded] = useState(false);



const sorted = useMemo(

 () =>

 (holdings ?? [])

 .slice()

 .sort(

 (a, b) =>

 (b.marketValue ?? b.costBasis ?? 0) -

 (a.marketValue ?? a.costBasis ?? 0)

 ),

[holdings]

 );



const topThree = sorted.slice(0, 3);

const remaining = sorted.slice(3);



return (

<article className="rounded-2xl border bg-white p-4">

<div className="flex items-baseline justify-between gap-4">

<div>

<h3 className="text-sm font-medium text-zinc-900">{title}</h3>

{subtitle && (

<p className="mt-1 text-xs text-zinc-500">{subtitle}</p>

 )}

</div>

<div className="text-right">

<div className="text-sm font-semibold tabular-nums">

 ${value}

</div>

</div>

</div>



{holdings && holdings.length > 0 && (

<div className="mt-3 space-y-2 text-xs">

{topThree.map((h) => (

<div

key={`${h.accountId}-${h.ticker}`}

className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2"

>

<div>

<div className="font-medium">{h.ticker}</div>

<div className="mt-0.5 text-[11px] text-zinc-500">

{h.quantity.toFixed(3)} shares

</div>

</div>

<div className="text-right tabular-nums">

<div className="text-xs">

{h.marketValue != null

? `$${money(h.marketValue)}`

: `$${money(h.costBasis)}`

}

</div>

{h.currentPrice != null && (

<div className="mt-0.5 text-[11px] text-zinc-500">

 @ ${money(h.currentPrice)}

</div>

 )}

</div>

</div>

 ))}



{remaining.length > 0 && (

<button

type="button"

onClick={() => setExpanded((x) => !x)}

className="mt-1 w-full rounded-xl border px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"

>

{expanded

? "Hide holdings"

: `View all holdings (${sorted.length})`}

</button>

 )}



{expanded && remaining.length > 0 && (

<div className="mt-2 space-y-1 rounded-xl border bg-white px-3 py-2">

{remaining.map((h) => (

<div

key={`${h.accountId}-${h.ticker}-all`}

className="flex items-center justify-between text-xs"

>

<span>{h.ticker}</span>

<span className="tabular-nums">

{h.quantity.toFixed(3)} • $

{money(h.marketValue ?? h.costBasis)}

</span>

</div>

 ))}

</div>

 )}

</div>

 )}

</article>

 );

}


 "use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, isoNow, monthKeyFromISO, type Account, type Transaction } from "@/lib/db";
import { getLatestPrice } from "@/lib/prices";

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
  const accounts =
    useLiveQuery(async () => db.accounts.toArray(), []) ?? [];

  const txs =
    useLiveQuery(
      async () =>
        db.transactions.orderBy("effectiveDate").toArray(),
      []
    ) ?? [];

  const lots =
    useLiveQuery(async () => db.holdingLots.toArray(), []) ?? [];

  const priceSnapshots =
    useLiveQuery(async () => db.priceSnapshots.toArray(), []) ?? [];

  const [exportText, setExportText] = useState<string | null>(null);

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

  const totalAssets = totalCashAssets + totalInvestmentAssets;

  const totalLiabilities = useMemo(
    () =>
      accounts
        .filter((a) => a.type === "debt")
        .reduce((sum, a) => sum + (accountCash[a.id] ?? 0), 0),
    [accounts, accountCash]
  );

  const netWorth = totalAssets - totalLiabilities;

  // Net worth over time (simple daily series based on transactions + prices)
  const netWorthSeries = useMemo(() => {
    if (!txs.length) return [];

    const dates = Array.from(
      new Set(
        txs.map((t) => t.effectiveDate.slice(0, 10)) // YYYY-MM-DD
      )
    ).sort();

    // Pre-group transactions by date
    const byDate: Record<string, Transaction[]> = {};
    for (const t of txs) {
      const d = t.effectiveDate.slice(0, 10);
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(t);
    }

    // Helper to get latest price on or before date
    const priceHistory: Record<string, { date: string; price: number }[]> =
      {};
    for (const snap of priceSnapshots) {
      const t = snap.ticker.toUpperCase();
      if (!priceHistory[t]) priceHistory[t] = [];
      priceHistory[t].push({ date: snap.date, price: snap.closePrice });
    }
    for (const t of Object.keys(priceHistory)) {
      priceHistory[t].sort((a, b) => (a.date < b.date ? -1 : 1));
    }
    const priceOnOrBefore = (ticker: string, date: string): number | null => {
      const hist = priceHistory[ticker.toUpperCase()];
      if (!hist || !hist.length) return null;
      let best: number | null = null;
      for (const row of hist) {
        if (row.date <= date) best = row.price;
        else break;
      }
      return best;
    };

    const points: { date: string; value: number }[] = [];
    const runningAccountCash: Record<string, number> = {};
    const runningPositions: Record<string, number> = {}; // ticker -> qty

    for (const a of accounts) {
      runningAccountCash[a.id] = 0;
    }

    const applyTx = (t: Transaction) => {
      switch (t.type) {
        case "income":
          runningAccountCash[t.accountId] += t.amount;
          break;
        case "expense":
          runningAccountCash[t.accountId] -= t.amount;
          break;
        case "transfer":
          if (t.toAccountId) {
            runningAccountCash[t.accountId] -= t.amount;
            runningAccountCash[t.toAccountId] += t.amount;
          }
          break;
        case "buy": {
          const key = (t.ticker ?? "").toUpperCase();
          if (!key) break;
          const qty = t.quantity ?? 0;
          runningAccountCash[t.accountId] -= qty * (t.price ?? 0);
          runningPositions[key] = (runningPositions[key] ?? 0) + qty;
          break;
        }
        case "sell": {
          const key = (t.ticker ?? "").toUpperCase();
          if (!key) break;
          const qty = t.quantity ?? 0;
          runningAccountCash[t.accountId] += qty * (t.price ?? 0);
          runningPositions[key] = (runningPositions[key] ?? 0) - qty;
          break;
        }
      }
    };

    for (const d of dates) {
      const todays = byDate[d] ?? [];
      for (const t of todays) applyTx(t);

      const cashAssets = accounts
        .filter((a) => a.type === "cash")
        .reduce((sum, a) => sum + (runningAccountCash[a.id] ?? 0), 0);

      let mv = 0;
      for (const [ticker, qty] of Object.entries(runningPositions)) {
        if (qty <= 0) continue;
        const p = priceOnOrBefore(ticker, d);
        if (p != null) mv += qty * p;
      }

      const assets = cashAssets + mv;
      const debts = accounts
        .filter((a) => a.type === "debt")
        .reduce((sum, a) => sum + (runningAccountCash[a.id] ?? 0), 0);

      points.push({ date: d, value: assets - debts });
    }

    return points;
  }, [txs, accounts, priceSnapshots]);

  // Simple SVG line chart
  const chartViewBox = "0 0 300 140";
  const chartPath = useMemo(() => {
    if (!netWorthSeries.length) return "";
    const values = netWorthSeries.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const width = 300;
    const height = 120;
    return netWorthSeries
      .map((p, i) => {
        const x =
          (netWorthSeries.length === 1
            ? width / 2
            : (i / (netWorthSeries.length - 1)) * width) + 10;
        const y = height - ((p.value - min) / span) * height + 10;
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }, [netWorthSeries]);

  // Monthly cashflow (for export snapshot)
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

  const cashAccount = useMemo(
    () =>
      accounts.find((a) => a.name.toLowerCase() === "cash") ?? null,
    [accounts]
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
      <div className="mx-auto max-w-4xl px-4 py-6 pb-24 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/operations"
              className="rounded-xl border px-3 py-1.5 text-xs hover:bg-zinc-50"
            >
              Back to Operations
            </Link>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Capital
            </h1>
          </div>
          <button
            onClick={onExport}
            className="rounded-xl border px-3 py-1.5 text-xs hover:bg-zinc-50"
          >
            Export Financial Snapshot
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KPI label="Total Assets" value={`$${money(totalAssets)}`} />
          <KPI
            label="Total Liabilities"
            value={`$${money(totalLiabilities)}`}
          />
          <KPI label="Net Worth" value={`$${money(netWorth)}`} />
        </div>

        <section className="mt-8 rounded-2xl border">
          <div className="px-4 py-3 text-sm font-medium border-b">
            Assets by Account Type
          </div>
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <AssetGroup
              title="Cash"
              accounts={accounts.filter((a) => a.type === "cash")}
              accountCash={accountCash}
            />
            <HoldingsGroup
              title="Brokerage"
              accounts={accounts.filter((a) => a.type === "brokerage")}
              holdings={holdings}
            />
            <HoldingsGroup
              title="Roth IRA"
              accounts={accounts.filter((a) => a.type === "roth")}
              holdings={holdings}
            />
            <HoldingsGroup
              title="Crypto"
              accounts={accounts.filter((a) => a.type === "crypto")}
              holdings={holdings}
            />
          </div>
        </section>

        <section className="mt-8 rounded-2xl border">
          <div className="px-4 py-3 text-sm font-medium border-b">
            Net Worth Over Time
          </div>
          {netWorthSeries.length === 0 ? (
            <div className="px-4 py-6 text-sm text-zinc-500">
              Not enough history yet.
            </div>
          ) : (
            <div className="px-4 py-4">
              <svg
                viewBox={chartViewBox}
                className="h-40 w-full text-zinc-900"
              >
                <path
                  d={chartPath}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          )}
        </section>

        {exportText && (
          <section className="mt-8 rounded-2xl border">
            <div className="px-4 py-3 text-sm font-medium border-b">
              Export Financial Snapshot
            </div>
            <div className="px-4 py-3 space-y-2">
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

function AssetGroup(props: {
  title: string;
  accounts: Account[];
  accountCash: Record<string, number>;
}) {
  const { title, accounts, accountCash } = props;
  if (!accounts.length) return null;
  return (
    <div>
      <div className="text-xs font-medium text-zinc-500 mb-2">
        {title}
      </div>
      <div className="space-y-2 text-sm">
        {accounts.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between rounded-xl border px-3 py-2"
          >
            <div>{a.name}</div>
            <div className="tabular-nums text-zinc-900">
              ${money(accountCash[a.id] ?? 0)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HoldingsGroup(props: {
  title: string;
  accounts: Account[];
  holdings: HoldingView[];
}) {
  const { title, accounts, holdings } = props;
  const accountIds = new Set(accounts.map((a) => a.id));
  const filtered = holdings.filter((h) => accountIds.has(h.accountId));
  if (!accounts.length || !filtered.length) return null;

  return (
    <div className="sm:col-span-2">
      <div className="text-xs font-medium text-zinc-500 mb-2">
        {title}
      </div>
      <div className="overflow-hidden rounded-2xl border">
        <table className="min-w-full text-xs">
          <thead className="bg-zinc-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Ticker</th>
              <th className="px-3 py-2 text-left font-medium">Account</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">Avg Cost</th>
              <th className="px-3 py-2 text-right font-medium">
                Price
              </th>
              <th className="px-3 py-2 text-right font-medium">Value</th>
              <th className="px-3 py-2 text-right font-medium">
                Unrlzd P/L
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((h, i) => (
              <tr
                key={`${h.accountId}-${h.ticker}-${i}`}
                className="border-t"
              >
                <td className="px-3 py-2">{h.ticker}</td>
                <td className="px-3 py-2">{h.accountName}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {h.quantity.toFixed(4)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  ${money(h.avgCost)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {h.currentPrice != null
                    ? `$${money(h.currentPrice)}`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {h.marketValue != null
                    ? `$${money(h.marketValue)}`
                    : "—"}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    (h.unrealizedPnl ?? 0) > 0
                      ? "text-emerald-600"
                      : (h.unrealizedPnl ?? 0) < 0
                      ? "text-rose-600"
                      : "text-zinc-900"
                  }`}
                >
                  {h.unrealizedPnl != null
                    ? `$${money(h.unrealizedPnl)}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
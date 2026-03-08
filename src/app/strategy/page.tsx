 "use client";

import Link from "next/link";
import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, isoNow, monthKeyFromISO } from "@/lib/db";
import { NavMenu } from "@/components/NavMenu";

function money(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function StrategyPage() {
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

  // Net worth (same basic idea as capital page)
  const accountCash = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of accounts) map[a.id] = 0;
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

  const rawHoldings = useMemo(() => {
    const map: Record<string, { ticker: string; quantity: number; totalCost: number }> =
      {};
    for (const lot of lots) {
      const key = lot.ticker.toUpperCase();
      if (!map[key]) {
        map[key] = { ticker: key, quantity: 0, totalCost: 0 };
      }
      map[key].quantity += lot.quantityRemaining;
      map[key].totalCost += lot.quantityRemaining * lot.unitCost;
    }
    return Object.values(map);
  }, [lots]);

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

  const totalCashAssets = useMemo(
    () =>
      accounts
        .filter((a) => a.type === "cash")
        .reduce((sum, a) => sum + (accountCash[a.id] ?? 0), 0),
    [accounts, accountCash]
  );

  const investmentValue = useMemo(() => {
    let sum = 0;
    for (const h of rawHoldings) {
      const p = latestPriceByTicker(h.ticker);
      if (p != null) sum += p * h.quantity;
      else sum += h.totalCost;
    }
    return sum;
  }, [rawHoldings, latestPriceByTicker]);

  const totalAssets = totalCashAssets + investmentValue;
  const totalLiabilities = useMemo(
    () =>
      accounts
        .filter((a) => a.type === "debt")
        .reduce((sum, a) => sum + (accountCash[a.id] ?? 0), 0),
    [accounts, accountCash]
  );
  const netWorth = totalAssets - totalLiabilities;

  // Monthly surplus based on current month
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

  const monthlySurplus = monthlyRevenue - monthlyExpenses;

  // Retirement projection (assume current age 30, retire at 60, 7% annual return)
  const yearsToRetirement = 30;
  const r = 0.07 / 12; // monthly rate
  const n = yearsToRetirement * 12;
  const PV = netWorth;
  const PMT = Math.max(monthlySurplus, 0); // assume no negative contributions

  const fvLump = PV * Math.pow(1 + r, n);
  const fvContrib =
    PMT > 0 ? PMT * ((Math.pow(1 + r, n) - 1) / r) : 0;
  const projectedRetirementValue = fvLump + fvContrib;

  // IRA progress (Roth contributions this year vs 6,500 limit)
  const thisYear = new Date().getFullYear().toString();
  const rothAccount = useMemo(
    () =>
      accounts.find((a) => a.type === "roth") ?? null,
    [accounts]
  );

  const rothContributionsThisYear = useMemo(() => {
    if (!rothAccount) return 0;
    return txs
      .filter((t) => {
        const year = new Date(t.effectiveDate).getFullYear().toString();
        return (
          year === thisYear &&
          t.type === "transfer" &&
          t.toAccountId === rothAccount.id
        );
      })
      .reduce((s, t) => s + t.amount, 0);
  }, [txs, rothAccount, thisYear]);

  const rothLimit = 7500;
  const rothPct = Math.min(
    rothContributionsThisYear / (rothLimit || 1),
    1
  );

  // Financial runway = total cash / avg monthly expenses (last few months)
  const expensesByMonth = useMemo(() => {
    const map: Record<string, number> = {};
    if (!cashAccount) return map;
    for (const t of txs) {
      if (t.type !== "expense") continue;
      if (t.accountId !== cashAccount.id) continue;
      const mk = monthKeyFromISO(t.effectiveDate);
      map[mk] = (map[mk] ?? 0) + t.amount;
    }
    return map;
  }, [txs, cashAccount]);

  const avgMonthlyExpenses = useMemo(() => {
    const vals = Object.values(expensesByMonth);
    if (!vals.length) return 0;
    const sum = vals.reduce((a, b) => a + b, 0);
    return sum / vals.length;
  }, [expensesByMonth]);

  const runwayMonths =
    avgMonthlyExpenses > 0
      ? totalCashAssets / avgMonthlyExpenses
      : Infinity;

  return (
    <main className="min-h-screen bg-white text-black">
      <NavMenu title="Strategy" />
      <div className="mx-auto max-w-4xl px-4 pb-24 pt-6 sm:px-6">
        <section className="rounded-2xl border">
          <div className="px-4 py-3 text-sm font-medium border-b">
            Retirement Projection
          </div>
          <div className="px-4 py-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Current Net Worth</span>
              <span className="tabular-nums">
                ${money(netWorth)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">
                Monthly Investment Surplus
              </span>
              <span className="tabular-nums">
                ${money(monthlySurplus)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">
                Assumed Annual Return
              </span>
              <span className="tabular-nums">7%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">
                Estimated Value at Age 60
              </span>
              <span className="tabular-nums font-semibold">
                ${money(projectedRetirementValue)}
              </span>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              This is a rough compound-growth projection assuming 30
              years until retirement and constant contributions and
              returns. It is not financial advice.
            </p>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border">
          <div className="px-4 py-3 text-sm font-medium border-b">
            Roth IRA Progress
          </div>
          <div className="px-4 py-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">
                Contributions This Year
              </span>
              <span className="tabular-nums">
                ${money(rothContributionsThisYear)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Annual Limit</span>
              <span className="tabular-nums">
                ${money(rothLimit)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Progress</span>
              <span className="tabular-nums">
                {(rothPct * 100).toFixed(1)}%
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${rothPct * 100}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Based on transfers into your Roth account recorded this
              calendar year.
            </p>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border">
          <div className="px-4 py-3 text-sm font-medium border-b">
            Financial Runway
          </div>
          <div className="px-4 py-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Total Cash</span>
              <span className="tabular-nums">
                ${money(totalCashAssets)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">
                Avg Monthly Expenses (Cash)
              </span>
              <span className="tabular-nums">
                ${money(avgMonthlyExpenses)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">
                Runway (months without income)
              </span>
              <span className="tabular-nums font-semibold">
                {runwayMonths === Infinity
                  ? "∞"
                  : runwayMonths.toFixed(1)}
              </span>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Runway is estimated as total cash divided by your average
              monthly expenses paid from the Cash account.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
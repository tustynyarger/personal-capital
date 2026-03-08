 "use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, isoNow, makeId, monthKeyFromISO } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { CATEGORY_OPTIONS } from "@/lib/categories";
import { parseCommand, type ParsedCommand } from "@/lib/parser";
import { getLatestPrice, refreshPricesOnceDaily } from "@/lib/prices";
import { NavMenu } from "@/components/NavMenu";

function money(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function OperationsPage() {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [parsed, setParsed] = useState<ParsedCommand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    ensureSeeded().catch(console.error);
  }, []);

  const accounts =
    useLiveQuery(async () => db.accounts.toArray(), []) ?? [];

  const txs =
    useLiveQuery(
      async () =>
        db.transactions.orderBy("effectiveDate").reverse().toArray(),
      []
    ) ?? [];

  useEffect(() => {
    if (!selectedAccountId && accounts.length) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  const monthKey = monthKeyFromISO(isoNow());

  const cashAccount = useMemo(
    () =>
      accounts.find((a) => a.name.toLowerCase() === "cash") ?? null,
    [accounts]
  );

  // All transactions (any date), optionally filtered by search for the list view
  const visibleTxs = useMemo(() => {
    if (!search) return txs;

    const s = search.toLowerCase();

    return txs.filter((t) =>
      `${t.description} ${t.category} ${t.ticker ?? ""}`
        .toLowerCase()
        .includes(s)
    );
  }, [txs, search]);

  // This month's transactions (used for KPIs only)
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

  // Only expenses that hit the main Cash account (not investments)
  const monthlyOpEx = useMemo(
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

  const netCashPosition = monthlyRevenue - monthlyOpEx;

  function onPreview() {
    setError(null);
    setInfo(null);
    const p = parseCommand(input);
    setParsed(p);

    if (p.kind === "buy" && p.accountHint && accounts.length) {
      const hint = p.accountHint.toLowerCase();
      const match =
        accounts.find((a) => a.name.toLowerCase().includes(hint)) ?? null;
      if (match) {
        setSelectedAccountId(match.id);
      }
    }

    if (p.kind === "income" || p.kind === "expense") {
      setSelectedCategory(p.categoryGuess.category);
    }

    if (p.kind === "income" && accounts.length) {
      const cash = accounts.find(
        (a) => a.name.toLowerCase() === "cash"
      );
      if (cash) {
        setSelectedAccountId(cash.id);
      }
    }
  }

  async function commit() {
    if (!parsed || parsed.kind === "unknown") return;

    setPending(true);

    try {
      const now = isoNow();

      const cashAccount = accounts.find(
        (a) => a.name.toLowerCase() === "cash"
      );

      if (!cashAccount) {
        setError("Cash account not found.");
        return;
      }

      // ---------------- BUY ----------------
      if (parsed.kind === "buy") {
        if (!selectedAccountId) {
          setError("Choose an account.");
          return;
        }

        const targetAccountId = selectedAccountId;

        let marketPrice = await getLatestPrice(parsed.ticker);

        if (marketPrice == null) {
          // After a DB reset, we may have no price snapshots yet.
          // Try to fetch and store the latest price for this ticker on demand.
          try {
            await refreshPricesOnceDaily([parsed.ticker]);
            marketPrice = await getLatestPrice(parsed.ticker);
          } catch (e: any) {
            setError(e?.message ?? "Failed to fetch latest price.");
            return;
          }
        }

        if (marketPrice == null) {
          setError("No price data available for ticker.");
          return;
        }

        let quantity = 0;
        let cost = 0;

        if (parsed.quantity && parsed.price) {
          quantity = parsed.quantity;
          cost = parsed.quantity * parsed.price;
        } else {
          cost = parsed.amount ?? 0;
          quantity = cost / marketPrice;
        }

        const accountCash = computeAccountCash(accounts, txs);
        const targetCash = accountCash[targetAccountId] ?? 0;

        if (targetCash < cost) {
          const needed = cost - targetCash;
          const mainCashBalance = accountCash[cashAccount.id] ?? 0;

          if (mainCashBalance < needed) {
            setError("Insufficient cash to fund purchase.");
            return;
          }

          await db.transactions.add({
            id: makeId("tx"),
            createdAt: now,
            effectiveDate: now,
            type: "transfer",
            amount: needed,
            description: `Auto-fund ${parsed.ticker}`,
            category: "Transfer",
            accountId: cashAccount.id,
            toAccountId: targetAccountId,
          });
        }

        await db.transactions.add({
          id: makeId("tx"),
          createdAt: now,
          effectiveDate: now,
          type: "buy",
          amount: 0,
          description: `Buy ${parsed.ticker}`,
          category: "Investment",
          accountId: targetAccountId,
          ticker: parsed.ticker,
          quantity,
          price: marketPrice,
        });

        await db.holdingLots.add({
          id: makeId("lot"),
          ticker: parsed.ticker,
          accountId: targetAccountId,
          quantityRemaining: quantity,
          unitCost: marketPrice,
          acquiredAt: now,
        });

        reset();
        return;
      }

      // ---------------- INCOME ----------------
      if (parsed.kind === "income") {
        await db.transactions.add({
          id: makeId("tx"),
          createdAt: now,
          effectiveDate: now,
          type: "income",
          amount: parsed.amount,
          description: parsed.description,
          category: selectedCategory || "Revenue",
          accountId: cashAccount.id, // ALWAYS CASH
        });

        reset();
        return;
      }

      // ---------------- EXPENSE ----------------
      if (parsed.kind === "expense") {
        if (!selectedAccountId) {
          setError("Choose an account.");
          return;
        }

        const isCommission = parsed.description
          .toLowerCase()
          .includes("commission");
        const expenseAccountId = isCommission ? cashAccount.id : selectedAccountId;

        await db.transactions.add({
          id: makeId("tx"),
          createdAt: now,
          effectiveDate: now,
          type: "expense",
          amount: parsed.amount,
          description: parsed.description,
          category: selectedCategory,
          accountId: expenseAccountId,
        });

        reset();
        return;
      }
    } catch (e: any) {
      setError(e?.message ?? "Commit failed.");
    } finally {
      setPending(false);
    }
  }

  function reset() {
    setInput("");
    setParsed(null);
    setError(null);
    setInfo(null);
  }

  function computeAccountCash(accounts: any[], txs: any[]) {
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
  }

  const accountCash = computeAccountCash(accounts, txs);

  const totalCashAvailable =
    cashAccount && accountCash ? accountCash[cashAccount.id] ?? 0 : 0;

  return (
    <main className="min-h-screen bg-white text-black">
      <NavMenu title="Operations" />
      <div className="mx-auto max-w-3xl px-4 pb-28 pt-6 sm:px-6">
        <div className="mt-1 flex flex-wrap gap-2">
          <button
            onClick={async () => {
              if (
                !confirm(
                  "Reset database? This deletes all transactions, holdings, and prices."
                )
              )
                return;
              await db.transactions.clear();
              await db.holdingLots.clear();
              await db.priceSnapshots.clear();
              location.reload();
            }}
            className="rounded-xl border px-3 py-2 text-xs"
          >
            Reset Database
          </button>
          <button
            onClick={async () => {
              setError(null);
              setInfo(null);
              try {
                const tickers = Array.from(
                  new Set(
                    txs
                      .map((t) => t.ticker ?? "")
                      .filter((x): x is string => Boolean(x))
                  )
                );
                if (tickers.length === 0) {
                  setInfo("No tickers to refresh yet.");
                  return;
                }
                const { didRefresh, stored } =
                  await refreshPricesOnceDaily(tickers);
                if (!didRefresh) {
                  setInfo("Prices already up to date for today.");
                } else {
                  setInfo(`Refreshed prices for ${stored} symbol(s).`);
                }
              } catch (e: any) {
                setError(e?.message ?? "Failed to refresh prices.");
              }
            }}
            className="rounded-xl border px-3 py-2 text-xs"
          >
            Refresh Prices
          </button>
        </div>

        {(error || info) && (
          <div className="mt-3 text-xs">
            {error && <div className="text-red-600">{error}</div>}
            {info && !error && <div className="text-zinc-600">{info}</div>}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <KPI
            label="Monthly Revenue"
            value={`$${money(monthlyRevenue)}`}
          />
          <KPI
            label="Monthly Expenses"
            value={`$${money(monthlyOpEx)}`}
          />
          <KPI
            label="Monthly Net Cash Position"
            value={`$${money(netCashPosition)}`}
          />
          <KPI
            label="Total Cash Available"
            value={`$${money(totalCashAvailable)}`}
          />
        </div>

        <div className="mt-8 rounded-2xl border">
          <div className="px-4 py-3 text-sm font-medium border-b">
            Transactions
          </div>

          <div className="px-4 py-3 border-b">
            <input
              placeholder="Search by description, category, or ticker..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>

          {visibleTxs.length === 0 ? (
            <div className="px-4 py-6 text-sm text-zinc-500">
              No transactions found.
            </div>
          ) : (
            <ul>
              {visibleTxs.map((t) => {
                const isOutflow =
                  t.type === "expense" ||
                  t.type === "buy" ||
                  (t.type === "transfer" &&
                    cashAccount &&
                    t.accountId === cashAccount.id);

                const isInflow =
                  t.type === "income" ||
                  t.type === "sell" ||
                  (t.type === "transfer" &&
                    cashAccount &&
                    t.toAccountId === cashAccount.id);

                const sign = isOutflow ? "-" : isInflow ? "+" : "";

                const amountDisplay =
                  t.type === "buy" || t.type === "sell"
                    ? (t.quantity ?? 0) * (t.price ?? 0)
                    : t.amount;

                return (
                  <li
                    key={t.id}
                    className="flex justify-between px-4 py-3 border-b text-sm"
                  >
                    <div>
                      <div>{t.description}</div>
                      <div className="text-xs text-zinc-500">
                        {shortDate(t.effectiveDate)} • {t.type}
                        {t.category ? ` • ${t.category}` : ""}
                        {t.ticker ? ` • ${t.ticker}` : ""}
                      </div>
                    </div>
                    <div className="tabular-nums">
                      {sign}
                      ${money(amountDisplay)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-8 sticky bottom-3 sm:bottom-4">
          <div className="rounded-2xl border bg-white p-3 shadow-lg space-y-3">
            {parsed && parsed.kind !== "unknown" && (
              <div>
                <div className="text-sm font-medium mb-3">Preview</div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-zinc-500">Account</div>
                    <select
                      value={selectedAccountId}
                      onChange={(e) =>
                        setSelectedAccountId(e.target.value)
                      }
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(parsed.kind === "income" ||
                    parsed.kind === "expense") && (
                    <div>
                      <div className="text-xs text-zinc-500">Category</div>
                      <select
                        value={selectedCategory}
                        onChange={(e) =>
                          setSelectedCategory(e.target.value)
                        }
                        className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                      >
                        {CATEGORY_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="text-red-600 text-sm mt-2">{error}</div>
                )}

                <button
                  onClick={commit}
                  disabled={pending}
                  className="mt-4 w-full rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white"
                >
                  Commit
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onPreview();
                }}
                placeholder='Examples: "4200 commission" • "buy vti 300 roth"'
                className="w-full rounded-xl border px-3 py-3 text-sm outline-none"
              />
              <button
                onClick={onPreview}
                className="rounded-xl border px-4 py-3 text-sm font-medium"
              >
                Preview
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function KPI(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="text-xs text-zinc-500">{props.label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">
        {props.value}
      </div>
    </div>
  );
}

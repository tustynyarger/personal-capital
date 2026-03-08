import { db, isoNow, type Account, makeId } from "./db";

const DEFAULT_ACCOUNTS: Account[] = [
  { id: "acct_cash", name: "Cash", type: "cash", createdAt: isoNow() },
  {
    id: "acct_brokerage",
    name: "Brokerage",
    type: "brokerage",
    createdAt: isoNow(),
  },
  { id: "acct_roth", name: "Roth", type: "roth", createdAt: isoNow() },
  { id: "acct_gold", name: "Gold", type: "other", createdAt: isoNow() },
  {
    id: "acct_deposit",
    name: "Rental Security Deposit",
    type: "cash",
    createdAt: isoNow(),
  },
  { id: "acct_btc", name: "Crypto", type: "crypto", createdAt: isoNow() },
];

export async function ensureSeeded() {
  const [lotCount] = await Promise.all([db.holdingLots.count()]);

  // Only seed when there are no holdings yet to avoid duplicating data.
  if (lotCount > 0) {
    return;
  }

  // Ensure required accounts exist without wiping any user-defined accounts.
  const existingAccounts = await db.accounts.toArray();
  const existingIds = new Set(existingAccounts.map((a) => a.id));
  const accountsToAdd = DEFAULT_ACCOUNTS.filter((a) => !existingIds.has(a.id));
  if (accountsToAdd.length) {
    await db.accounts.bulkAdd(accountsToAdd);
  }

  const now = isoNow();

  // Seed holdings: replace brokerage and Roth with detailed positions,
  // keep crypto and gold positions.
  await db.holdingLots.bulkAdd([
    // Brokerage holdings
    {
      id: makeId("lot"),
      ticker: "AAPL",
      accountId: "acct_brokerage",
      quantityRemaining: 4.76,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "SPY",
      accountId: "acct_brokerage",
      quantityRemaining: 1.7,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "IVV",
      accountId: "acct_brokerage",
      quantityRemaining: 2.03,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "TSLA",
      accountId: "acct_brokerage",
      quantityRemaining: 2.26,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "VOO",
      accountId: "acct_brokerage",
      quantityRemaining: 1.79,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "VTI",
      accountId: "acct_brokerage",
      quantityRemaining: 3.3,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "JNJ",
      accountId: "acct_brokerage",
      quantityRemaining: 1.13,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "MSFT",
      accountId: "acct_brokerage",
      quantityRemaining: 1.39,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "VEU",
      accountId: "acct_brokerage",
      quantityRemaining: 1.15,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "VWO",
      accountId: "acct_brokerage",
      quantityRemaining: 5.15,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "NPSNY",
      accountId: "acct_brokerage",
      quantityRemaining: 15,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "TLT",
      accountId: "acct_brokerage",
      quantityRemaining: 0.658797,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "GOVT",
      accountId: "acct_brokerage",
      quantityRemaining: 2.61,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "VTEB",
      accountId: "acct_brokerage",
      quantityRemaining: 0.40322,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "VNQ",
      accountId: "acct_brokerage",
      quantityRemaining: 0.33043,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "BRK.B",
      accountId: "acct_brokerage",
      quantityRemaining: 0.28218,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "AMZN",
      accountId: "acct_brokerage",
      quantityRemaining: 5.09,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "WMT",
      accountId: "acct_brokerage",
      quantityRemaining: 5.08,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "NVDA",
      accountId: "acct_brokerage",
      quantityRemaining: 7.14,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "ZG",
      accountId: "acct_brokerage",
      quantityRemaining: 1.42,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "Z",
      accountId: "acct_brokerage",
      quantityRemaining: 1.3,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "AMD",
      accountId: "acct_brokerage",
      quantityRemaining: 0.042056,
      unitCost: 100,
      acquiredAt: now,
    },

    // Roth holdings
    {
      id: makeId("lot"),
      ticker: "QQQ",
      accountId: "acct_roth",
      quantityRemaining: 5.5,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "VNQ",
      accountId: "acct_roth",
      quantityRemaining: 12.56,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "SPMO",
      accountId: "acct_roth",
      quantityRemaining: 11.62,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "NVDA",
      accountId: "acct_roth",
      quantityRemaining: 16.34,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "SCHD",
      accountId: "acct_roth",
      quantityRemaining: 38.32,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "TSLA",
      accountId: "acct_roth",
      quantityRemaining: 1.95,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "VOO",
      accountId: "acct_roth",
      quantityRemaining: 1.83,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "VWO",
      accountId: "acct_roth",
      quantityRemaining: 12.47,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "VEA",
      accountId: "acct_roth",
      quantityRemaining: 10.15,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "SPHQ",
      accountId: "acct_roth",
      quantityRemaining: 2.05,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "IVV",
      accountId: "acct_roth",
      quantityRemaining: 3.71,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "SCHG",
      accountId: "acct_roth",
      quantityRemaining: 3.8,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "BND",
      accountId: "acct_roth",
      quantityRemaining: 3.01,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "VB",
      accountId: "acct_roth",
      quantityRemaining: 0.53108,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "RGTI",
      accountId: "acct_roth",
      quantityRemaining: 1,
      unitCost: 100,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "IONQ",
      accountId: "acct_roth",
      quantityRemaining: 0.561606,
      unitCost: 100,
      acquiredAt: now,
    },

    // Crypto and gold holdings (unchanged from previous seed, but re-added here)
    {
      id: makeId("lot"),
      ticker: "BTC",
      accountId: "acct_btc",
      quantityRemaining: 0.02,
      unitCost: 40000,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "ETH",
      accountId: "acct_btc",
      quantityRemaining: 0.01,
      unitCost: 2000,
      acquiredAt: now,
    },
    {
      id: makeId("lot"),
      ticker: "GOLD",
      accountId: "acct_gold",
      quantityRemaining: 0.5,
      unitCost: 3400,
      acquiredAt: now,
    },
  ]);

  // Seed base cash balances:
  // Cash = 5,564; Rental Security Deposit = 887.
  await db.transactions.bulkAdd([
    {
      id: makeId("tx"),
      createdAt: now,
      effectiveDate: now,
      type: "income",
      amount: 5564,
      description: "Initial cash balance",
      category: "Seed",
      accountId: "acct_cash",
    },
    {
      id: makeId("tx"),
      createdAt: now,
      effectiveDate: now,
      type: "income",
      amount: 887,
      description: "Initial rental security deposit",
      category: "Seed",
      accountId: "acct_deposit",
    },
  ]);
}
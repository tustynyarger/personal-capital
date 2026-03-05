import { db, isoNow, type Account, makeId } from "./db";

const DEFAULT_ACCOUNTS: Account[] = [
  { id: "acct_cash", name: "Cash", type: "cash", createdAt: isoNow() },
  { id: "acct_brokerage", name: "Brokerage", type: "brokerage", createdAt: isoNow() },
  { id: "acct_roth", name: "Roth", type: "roth", createdAt: isoNow() },
  { id: "acct_gold", name: "Gold", type: "other", createdAt: isoNow() },
  { id: "acct_btc", name: "BTC", type: "crypto", createdAt: isoNow() },
];

export async function ensureSeeded() {
  const existing = await db.accounts.toArray();

  if (false) return;
  await db.accounts.bulkAdd(DEFAULT_ACCOUNTS);

  await db.holdingLots.bulkAdd([
    {
      id: makeId("lot"),
      ticker: "FIGR",
      accountId: "acct_brokerage",
      quantityRemaining: 1,
      unitCost: 12766,
      acquiredAt: isoNow(),
    },
    {
      id: makeId("lot"),
      ticker: "ROTH_INDEX",
      accountId: "acct_roth",
      quantityRemaining: 1,
      unitCost: 13188,
      acquiredAt: isoNow(),
    },
    {
      id: makeId("lot"),
      ticker: "BTC",
      accountId: "acct_btc",
      quantityRemaining: 0.02,
      unitCost: 40000,
      acquiredAt: isoNow(),
    },
    {
      id: makeId("lot"),
      ticker: "ETH",
      accountId: "acct_btc",
      quantityRemaining: 0.01,
      unitCost: 2000,
      acquiredAt: isoNow(),
    },
    {
      id: makeId("lot"),
      ticker: "GOLD",
      accountId: "acct_gold",
      quantityRemaining: 0.5,
      unitCost: 3400,
      acquiredAt: isoNow(),
    },
  ]);
}
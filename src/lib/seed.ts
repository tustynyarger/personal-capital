import { db, isoNow, type Account } from "./db";

const DEFAULT_ACCOUNTS: Account[] = [
  { id: "acct_cash", name: "Cash", type: "cash", createdAt: isoNow() },
  { id: "acct_brokerage", name: "Brokerage", type: "brokerage", createdAt: isoNow() },
  { id: "acct_roth", name: "Roth", type: "roth", createdAt: isoNow() },
  { id: "acct_gold", name: "Gold", type: "other", createdAt: isoNow() },
  { id: "acct_btc", name: "BTC", type: "crypto", createdAt: isoNow() },
];

export async function ensureSeeded() {
  const existing = await db.accounts.toArray();

  if (existing.length > 0) return;

  await db.accounts.bulkAdd(DEFAULT_ACCOUNTS);
}
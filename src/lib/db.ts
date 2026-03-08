// src/lib/db.ts
import Dexie, { Table } from "dexie";

export interface Account {
  id: string;
  name: string; // Cash, Brokerage, Roth, BTC, Gold, etc
  type: string; // cash, brokerage, roth, crypto, gold (string is fine)
  createdAt?: string;
}

export type Asset = {
  id: string;
  name: string;
  category: string;
  ticker?: string;
  value?: number;
  createdAt: string;
};

export interface Transaction {
  id: string;
  createdAt: string;
  effectiveDate: string; // ISO
  type: "income" | "expense" | "buy" | "sell" | "transfer";
  amount: number; // income/expense/transfer amount; buy/sell can be 0
  description: string;
  category: string;
  accountId: string; // primary account for the tx
  toAccountId?: string; // for transfers
  ticker?: string; // for buys/sells
  quantity?: number; // shares/units
  price?: number; // price used
}

export interface HoldingLot {
  id: string;
  ticker: string;
  accountId: string;
  quantityRemaining: number;
  unitCost: number;
  acquiredAt: string;
}

export interface PriceSnapshot {
  id?: number;
  ticker: string; // USER ticker e.g. VTI, BTC, ETH, GOLD
  date: string;   // YYYY-MM-DD
  closePrice: number;
}

export interface WatchlistItem {
  ticker: string;    // USER ticker e.g. BTC (not BTC-USD)
  createdAt: string;
}

export interface WealthHistory {
  id?: number;
  date: string; // YYYY-MM-DD
  netWorth: number;
}

export class PCCDatabase extends Dexie {
  accounts!: Table<Account, string>;
  transactions!: Table<Transaction, string>;
  holdingLots!: Table<HoldingLot, string>;
  priceSnapshots!: Table<PriceSnapshot, number>;
  watchlist!: Table<WatchlistItem, string>;
  wealth_history!: Table<WealthHistory, number>;
  manual_prices!: Table<{ ticker: string; price: number}, string  >;
  assets!: Table<Asset>;

  constructor() {
    super("pcc-db");

    // If you already had version(2), bumping to 3 ensures the new table exists.
    this.version(4).stores({
      accounts: "id, name, type",
      transactions: "id, effectiveDate, accountId, type",
      holdingLots: "id, ticker, accountId",
      priceSnapshots: "++id, ticker, date",
      watchlist: "ticker",
      wealth_history: "++id, date",
      manual_prices: "ticker",
      assets: "id,category"
    });
  }
}

export const db = new PCCDatabase();

export function isoNow() {
  return new Date().toISOString();
}

export function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function monthKeyFromISO(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}
"use client";

import { useEffect, useState } from "react";
import {
  getManualPriceOverrides,
  setManualPriceOverride,
  removeManualPriceOverride,
} from "@/lib/prices";

type Props = {
  onChange?: () => void;
};

export function ManualPriceEditor({ onChange }: Props) {
  const [ticker, setTicker] = useState("");
  const [price, setPrice] = useState("");
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  function refresh() {
    setOverrides(getManualPriceOverrides());
  }

  useEffect(() => {
    refresh();
  }, []);

  function onSave() {
    const t = ticker.trim().toUpperCase();
    const p = Number(price);
  
    if (!t || Number.isNaN(p) || p <= 0) return;
  
    setManualPriceOverride(t, p);
    setTicker("");
    setPrice("");
  
    refresh();
    onChange?.();
  }

  function onDelete(t: string) {
    removeManualPriceOverride(t);
    refresh();
    onChange?.();
  }

  return (
    <section className="mt-6 rounded-2xl border bg-white p-4 sm:p-5">
      <h2 className="text-sm font-medium text-zinc-900">Manual Price Overrides</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Use this for weird tickers that do not fetch correctly.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="Ticker"
          className="rounded-xl border px-3 py-2 text-sm"
        />
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Price"
          inputMode="decimal"
          className="rounded-xl border px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={onSave}
          className="rounded-xl bg-black px-3 py-2 text-sm font-medium text-white"
        >
          Save Override
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {Object.keys(overrides).length === 0 ? (
          <div className="text-xs text-zinc-500">No manual overrides yet.</div>
        ) : (
          Object.entries(overrides).map(([t, p]) => (
            <div
              key={t}
              className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">{t}</div>
                <div className="text-xs text-zinc-500">${p.toFixed(2)}</div>
              </div>

              <button
                type="button"
                onClick={() => onDelete(t)}
                className="rounded-lg border px-2 py-1 text-xs"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
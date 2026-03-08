"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/operations", label: "Operations" },
  { href: "/capital", label: "Capital" },
  { href: "/strategy", label: "Strategy" },
];

export function NavMenu({ title }: { title?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex flex-col">
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
              Personal Capital
            </span>
            {title && (
              <span className="text-sm font-semibold tracking-tight sm:text-base">
                {title}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-zinc-50"
          >
            <span className="hidden sm:inline">Open Menu</span>
            <span className="relative flex h-4 w-4 items-center justify-center">
              <span className="absolute h-px w-3.5 bg-zinc-900" />
              <span className="absolute h-px w-3.5 bg-zinc-900 translate-y-[4px]" />
              <span className="absolute h-px w-3.5 bg-zinc-900 -translate-y-[4px]" />
            </span>
            <span className="sr-only">Open navigation menu</span>
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
            aria-label="Close menu overlay"
          />
          <nav className="absolute inset-y-0 right-0 flex w-64 max-w-[80%] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">Menu</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50"
              >
                Close
              </button>
            </div>
            <div className="flex-1 space-y-1 px-2 py-2">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`block rounded-xl px-3 py-2 text-sm ${
                      isActive
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-900 hover:bg-zinc-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}


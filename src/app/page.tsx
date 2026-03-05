import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Personal Capital Command Center
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Deterministic, offline-first, one-user capital dashboard.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm font-medium text-center hover:bg-zinc-50 sm:w-auto"
            href="/operations"
          >
            Operations
          </Link>
          <Link
            className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm text-center hover:bg-zinc-50 sm:w-auto"
            href="/capital"
          >
            Capital (stub)
          </Link>
          <Link
            className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm text-center hover:bg-zinc-50 sm:w-auto"
            href="/strategy"
          >
            Strategy (stub)
          </Link>
        </div>
      </div>
    </main>
  );
}
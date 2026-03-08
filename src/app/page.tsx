import { NavMenu } from "@/components/NavMenu";

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <NavMenu title="Overview" />
      <div className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Personal Capital Command Center
        </h1>
        <p className="mt-3 text-sm text-zinc-600 sm:text-base">
          Track cash, investments, and strategy in one lightweight console.
          Use the menu in the top-right to jump between Operations, Capital,
          and Strategy.
        </p>
      </div>
    </main>
  );
}
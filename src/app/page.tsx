import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: 40 }}>
      <h1>Personal Capital Command Center</h1>

      <div style={{ marginTop: 20 }}>
        <Link href="/operations">Operations</Link>
      </div>

      <div>
        <Link href="/capital">Capital</Link>
      </div>

      <div>
        <Link href="/strategy">Strategy</Link>
      </div>
    </main>
  );
}
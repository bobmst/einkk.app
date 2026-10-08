import Dashboard from "./dashboard";

// A static shell: the numbers are fetched in the browser from the outbox, so
// a new forecast needs no rebuild (next.config.ts, docs/ARCHITECTURE.md).
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10 font-sans sm:px-6">
      <Dashboard />
    </main>
  );
}

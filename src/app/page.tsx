import Dashboard from "./dashboard";

// A static shell: the numbers are fetched in the browser from the outbox, so
// a new forecast needs no rebuild (next.config.ts, docs/ARCHITECTURE.md).
export default function Home() {
  return <Dashboard />;
}

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// the app's "@/..." imports (tsconfig paths), so a test can import a component that uses them
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});

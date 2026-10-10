import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The `@/*` import alias from tsconfig.json is a TypeScript-only concept, so
 * Vitest has to be told about it separately or any test touching a module
 * that imports `@/...` fails to resolve.
 */
export default defineConfig({
  /* infra/cdk.out holds staged copies of the build; never test those. */
  test: { exclude: ["**/node_modules/**", "infra/cdk.out/**"] },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});

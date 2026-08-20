import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Vitest had no configuration file at all, which meant it did not know about
// the "@/*" path alias that tsconfig.json defines and that the application
// source uses throughout. Test files could therefore only exercise modules
// whose entire import graph avoided the alias — the moment one reached, say,
// @/lib/prisma, collection failed with ERR_MODULE_NOT_FOUND and the whole file
// was reported as a failed suite rather than as failing tests.
//
// One alias, matching tsconfig's, so the tests resolve modules the same way
// the build does.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});

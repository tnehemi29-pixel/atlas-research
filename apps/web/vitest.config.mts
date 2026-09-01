import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', '.next'],
    setupFiles: ['./vitest.setup.ts'],
    // Many tests here are real-database integration tests (against the same
    // remote Neon instance production uses, deliberately — see
    // financialDataService.test.ts's own comment on why). Vitest's 5000ms
    // default is tuned for pure in-process tests; under this repo's actual
    // observed conditions (real network round trips, many test files
    // running concurrently against one shared remote database), that
    // default produces non-deterministic "Test timed out in 5000ms"
    // failures on tests that are otherwise correct — confirmed repeatedly by
    // the same tests passing cleanly when run in isolation. Several files
    // already override this per-test (20000-30000ms); this makes that the
    // default instead of relying on every new real-DB test to remember to
    // add its own override. Not a workaround for slow application code —
    // this file's own tests are unaffected either way.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});

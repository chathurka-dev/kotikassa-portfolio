import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['apps/web/vitest.config.ts', 'packages/shared/vitest.config.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      reportOnFailure: true,
      include: ['apps/web/lib/**/*.ts', 'packages/shared/src/**/*.ts'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        'packages/shared/src/index.ts',
        'packages/shared/src/native.ts',
      ],
      thresholds: {
        statements: 45,
        branches: 60,
        functions: 50,
        lines: 45,
        'apps/web/lib/report-aggregation.ts': {
          statements: 95,
          branches: 70,
          functions: 100,
          lines: 95,
        },
        'apps/web/lib/report-budget.ts': { 100: true },
        'apps/web/lib/receipt-date.ts': { 100: true },
        'apps/web/lib/receipt-scan-analysis.ts': {
          statements: 90,
          branches: 70,
          functions: 100,
          lines: 90,
        },
        'apps/web/lib/receipt-scan-feedback.ts': {
          statements: 100,
          branches: 65,
          functions: 100,
          lines: 100,
        },
        'apps/web/lib/correction-memory-cli.ts': {
          statements: 90,
          branches: 65,
          functions: 100,
          lines: 90,
        },
        'apps/web/lib/report-csv.ts': {
          statements: 100,
          branches: 80,
          functions: 100,
          lines: 100,
        },
        'apps/web/lib/report-view-state.ts': {
          statements: 98,
          branches: 85,
          functions: 100,
          lines: 98,
        },
        'packages/shared/src/utils/units.ts': {
          statements: 95,
          branches: 55,
          functions: 100,
          lines: 95,
        },
      },
    },
  },
})

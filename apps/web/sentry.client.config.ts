import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 10% of transactions for performance monitoring
  tracesSampleRate: 0.1,

  // Replay 100% of sessions with an error, 10% of others
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,

  // Only run Sentry in production
  enabled: process.env.NODE_ENV === 'production',
})

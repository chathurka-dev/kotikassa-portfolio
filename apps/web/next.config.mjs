import createNextIntlPlugin from 'next-intl/plugin'
import { withSentryConfig } from '@sentry/nextjs'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/** @type {import('next').NextConfig} */
const config = {
  transpilePackages: ['@kotikassa/shared', '@kotikassa/ocr'],
  reactStrictMode: true,
}

const nextIntlConfig = withNextIntl(config)

export default withSentryConfig(nextIntlConfig, {
  // Suppress the Sentry CLI output during build
  silent: true,
  // Upload source maps so stack traces in Sentry show real line numbers
  // Requires SENTRY_AUTH_TOKEN env var (set in Vercel dashboard)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Automatically instrument server components, API routes, etc.
  autoInstrumentServerFunctions: true,
  // Tree-shake Sentry debug code in production
  disableLogger: true,
})

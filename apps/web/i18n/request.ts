import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, isLocale } from './locales'

export default getRequestConfig(async ({ requestLocale }) => {
  const raw = await requestLocale
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE

  return {
    locale,
    messages: (await import(`../locales/${locale}.json`)).default,
  }
})

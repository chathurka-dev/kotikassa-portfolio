'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { LOCALE_COOKIE, LOCALES, type Locale } from '@/i18n/locales'

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'EN',
  fi: 'FI',
}

export default function LanguageSwitcher() {
  const locale = useLocale() as Locale
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('languageSwitcher')

  function switchLocale(next: Locale) {
    if (next === locale) return
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`
    startTransition(() => router.refresh())
  }

  return (
    <div
      className="flex items-center gap-1 rounded-lg border border-gray-200 p-1"
      title={t('label')}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => switchLocale(l)}
          disabled={isPending}
          className={`rounded px-2 py-0.5 text-xs font-semibold transition ${
            l === locale
              ? 'bg-indigo-600 text-white'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
          } disabled:opacity-50`}
        >
          {LOCALE_LABELS[l]}
        </button>
      ))}
    </div>
  )
}

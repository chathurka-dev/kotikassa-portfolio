// ============================================================
// Lightweight i18n for mobile — same locale JSON shape as web
// (next-intl namespaces), device locale as default.
// Usage: const t = useT('dashboard'); t('title'); t('afterSaving', { amount })
// ============================================================
import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getLocales } from 'expo-localization'
import en from '../locales/en.json'
import fi from '../locales/fi.json'

export type Locale = 'en' | 'fi'

const DICTS: Record<Locale, Record<string, unknown>> = { en, fi }

function deviceLocale(): Locale {
  const code = getLocales()[0]?.languageCode
  return code === 'fi' ? 'fi' : 'en'
}

interface I18nState {
  locale: Locale
  setLocale: (l: Locale) => void
}

const I18nContext = createContext<I18nState>({ locale: 'en', setLocale: () => {} })

const LOCALE_STORAGE_KEY = 'kotikassa.locale'

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(deviceLocale())

  useEffect(() => {
    AsyncStorage.getItem(LOCALE_STORAGE_KEY)
      .then((stored) => {
        if (stored === 'en' || stored === 'fi') setLocaleState(stored)
      })
      .catch((err) => console.error('[i18n] failed to read stored locale:', err))
  }, [])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    AsyncStorage.setItem(LOCALE_STORAGE_KEY, next).catch((err) =>
      console.error('[i18n] failed to persist locale:', err)
    )
  }, [])

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useLocale(): I18nState {
  return useContext(I18nContext)
}

function lookup(dict: Record<string, unknown>, path: string): string | undefined {
  let node: unknown = dict
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : undefined
}

// Translator scoped to a namespace, with {placeholder} interpolation.
export function useT(namespace: string): (key: string, params?: Record<string, string | number>) => string {
  const { locale } = useContext(I18nContext)
  return useMemo(() => {
    return (key: string, params?: Record<string, string | number>) => {
      const path = `${namespace}.${key}`
      const raw = lookup(DICTS[locale], path) ?? lookup(DICTS.en, path) ?? path
      if (!params) return raw
      return raw.replace(/\{(\w+)\}/g, (m, name: string) =>
        params[name] !== undefined ? String(params[name]) : m
      )
    }
  }, [locale, namespace])
}

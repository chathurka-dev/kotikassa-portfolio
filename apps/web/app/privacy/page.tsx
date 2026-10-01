'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import {
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_CONTROLLER_NAME,
  PRIVACY_NOTICE_VERSION,
} from '@kotikassa/shared'
import LanguageSwitcher from '@/components/LanguageSwitcher'

const DATA_KEYS = ['account', 'household', 'receipts', 'technical', 'preferences'] as const
const PURPOSE_KEYS = ['service', 'scanning', 'training', 'security', 'legal'] as const
const RECIPIENT_KEYS = ['supabase', 'vercel', 'openai', 'sentry', 'google'] as const
const RETENTION_KEYS = ['account', 'family', 'receipts', 'training', 'openai', 'technical'] as const
const RIGHTS_KEYS = ['access', 'correct', 'delete', 'restrict', 'portability', 'object', 'withdraw', 'complain'] as const

export default function PrivacyPage() {
  const t = useTranslations('privacy')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            {t('back')}
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-gray-900" translate="no">Kotikassa</span>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-10 border-b border-gray-200 pb-8">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-gray-600">{t('intro')}</p>
          <p className="mt-3 text-sm text-gray-500">
            {t('effectiveDate')} · {t('version', { version: PRIVACY_NOTICE_VERSION })}
          </p>
        </div>

        <div className="space-y-10 text-sm leading-7 text-gray-700">
          <section>
            <h2 className="text-xl font-semibold text-gray-900">{t('controller.title')}</h2>
            <p className="mt-3">{t('controller.body')}</p>
            <dl className="mt-4 grid gap-2 sm:grid-cols-[9rem_1fr]">
              <dt className="font-medium text-gray-900">{t('controller.name')}</dt>
              <dd>{PRIVACY_CONTROLLER_NAME}</dd>
              <dt className="font-medium text-gray-900">{t('controller.email')}</dt>
              <dd>
                <a className="text-indigo-700 underline hover:text-indigo-900" href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>
                  {PRIVACY_CONTACT_EMAIL}
                </a>
              </dd>
            </dl>
          </section>

          <NoticeList title={t('data.title')} intro={t('data.intro')} items={DATA_KEYS.map((key) => t(`data.items.${key}`))} />
          <NoticeList title={t('purposes.title')} intro={t('purposes.intro')} items={PURPOSE_KEYS.map((key) => t(`purposes.items.${key}`))} />
          <NoticeList title={t('recipients.title')} intro={t('recipients.intro')} items={RECIPIENT_KEYS.map((key) => t(`recipients.items.${key}`))} />

          <section>
            <h2 className="text-xl font-semibold text-gray-900">{t('scanning.title')}</h2>
            <p className="mt-3">{t('scanning.body')}</p>
            <p className="mt-3">{t('scanning.training')}</p>
          </section>

          <NoticeList title={t('retention.title')} intro={t('retention.intro')} items={RETENTION_KEYS.map((key) => t(`retention.items.${key}`))} />

          <section>
            <h2 className="text-xl font-semibold text-gray-900">{t('transfers.title')}</h2>
            <p className="mt-3">{t('transfers.body')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">{t('sharing.title')}</h2>
            <p className="mt-3">{t('sharing.body')}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900">{t('security.title')}</h2>
            <p className="mt-3">{t('security.body')}</p>
          </section>

          <NoticeList title={t('rights.title')} intro={t('rights.intro')} items={RIGHTS_KEYS.map((key) => t(`rights.items.${key}`))} />

          <section>
            <h2 className="text-xl font-semibold text-gray-900">{t('changes.title')}</h2>
            <p className="mt-3">{t('changes.body')}</p>
          </section>

          <section className="border-t border-gray-200 pt-8">
            <h2 className="text-xl font-semibold text-gray-900">{t('contact.title')}</h2>
            <p className="mt-3">{t('contact.body')}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                {t('contact.emailAction')}
              </a>
              <Link href="/privacy/consent" className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                {t('manageChoices')}
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

function NoticeList({ title, intro, items }: { title: string; intro: string; items: string[] }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      <p className="mt-3">{intro}</p>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  )
}

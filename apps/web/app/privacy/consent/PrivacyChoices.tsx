'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ShieldCheck } from 'lucide-react'
import {
  createClient,
  PRIVACY_NOTICE_VERSION,
  RECEIPT_SCANNING_CONSENT_VERSION,
  RECEIPT_TRAINING_CONSENT_VERSION,
} from '@kotikassa/shared'
import LanguageSwitcher from '@/components/LanguageSwitcher'

interface Props {
  nextPath: string
  noticeIsCurrent: boolean
  privacyNoticeShownAt: string | null
  receiptScanningEnabled: boolean
  receiptScanningConsentedAt: string | null
  receiptTrainingChoiceMade: boolean
  receiptTrainingChoiceIsCurrent: boolean
  receiptTrainingEnabled: boolean
  receiptTrainingConsentedAt: string | null
}

export default function PrivacyChoices({
  nextPath,
  noticeIsCurrent,
  privacyNoticeShownAt,
  receiptScanningEnabled: initialScanningEnabled,
  receiptScanningConsentedAt,
  receiptTrainingChoiceMade,
  receiptTrainingChoiceIsCurrent,
  receiptTrainingEnabled: initialTrainingEnabled,
  receiptTrainingConsentedAt,
}: Props) {
  const t = useTranslations('privacyChoices')
  const router = useRouter()
  const [scanningEnabled, setScanningEnabled] = useState(initialScanningEnabled)
  const [trainingEnabled, setTrainingEnabled] = useState(initialTrainingEnabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveChoices() {
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: saveError } = await supabase.rpc('set_privacy_choices', {
      p_privacy_notice_version: PRIVACY_NOTICE_VERSION,
      p_receipt_scanning_enabled: scanningEnabled,
      p_receipt_scanning_consent_version: scanningEnabled
        ? RECEIPT_SCANNING_CONSENT_VERSION
        : null,
    })

    if (saveError) {
      setError(t('saveError'))
      setSaving(false)
      return
    }

    if (
      receiptTrainingChoiceMade
      && (trainingEnabled !== initialTrainingEnabled || !receiptTrainingChoiceIsCurrent)
    ) {
      const { error: trainingError } = await supabase.rpc('set_receipt_training_choice', {
        p_enabled: trainingEnabled,
        p_choice_version: RECEIPT_TRAINING_CONSENT_VERSION,
        p_receipt_id: null,
      })
      if (trainingError) {
        setError(t('trainingSaveError'))
        setSaving(false)
        return
      }
    }

    router.push(nextPath)
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-5 flex items-center justify-between">
          <span className="text-sm font-bold text-gray-900" translate="no">Kotikassa</span>
          <LanguageSwitcher />
        </div>

        <div className="card p-6 sm:p-8">
          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">{t('intro')}</p>

          {error && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <div className="mt-6 space-y-5">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-700">
              {t('noticePresented')}{' '}
              <Link href="/privacy" target="_blank" className="font-medium text-indigo-700 underline hover:text-indigo-900">
                {t('privacyNotice')}
              </Link>
              {privacyNoticeShownAt && noticeIsCurrent && (
                <span className="mt-1 block text-xs text-gray-400">{t('noticeCurrent')}</span>
              )}
            </div>

            <div className="border-t border-gray-200 pt-5">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={scanningEnabled}
                  onChange={(event) => setScanningEnabled(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-900">{t('scanningTitle')}</span>
                  <span className="mt-1 block text-sm leading-6 text-gray-600">{t('scanningBody')}</span>
                  {receiptScanningConsentedAt && initialScanningEnabled && (
                    <span className="mt-1 block text-xs text-gray-400">{t('currentlyEnabled')}</span>
                  )}
                </span>
              </label>
            </div>

            {receiptTrainingChoiceMade && (
              <div className="border-t border-gray-200 pt-5">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={trainingEnabled}
                    onChange={(event) => setTrainingEnabled(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{t('trainingTitle')}</span>
                    <span className="mt-1 block text-sm leading-6 text-gray-600">{t('trainingBody')}</span>
                    {receiptTrainingConsentedAt && initialTrainingEnabled && (
                      <span className="mt-1 block text-xs text-gray-400">{t('trainingCurrentlyEnabled')}</span>
                    )}
                  </span>
                </label>
              </div>
            )}
          </div>

          <p className="mt-5 text-xs leading-5 text-gray-500">{t('manualEntry')}</p>

          <button
            onClick={saveChoices}
            disabled={saving}
            className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? t('saving') : t('continue')}
          </button>
        </div>
      </div>
    </div>
  )
}

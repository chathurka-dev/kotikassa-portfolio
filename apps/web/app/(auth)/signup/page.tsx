'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  createClient,
  PRIVACY_NOTICE_VERSION,
  RECEIPT_SCANNING_CONSENT_VERSION,
} from '@kotikassa/shared'

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  )
}

export default function SignupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get('invite')
  const t = useTranslations('signup')
  const tc = useTranslations('common')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [awaitingVerification, setAwaitingVerification] = useState(false)
  const [receiptScanningEnabled, setReceiptScanningEnabled] = useState(false)

  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError(t('passwordTooShort'))
      return
    }
    if (password !== confirmPassword) {
      setError(t('passwordMismatch'))
      return
    }
    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name.trim(),
          privacy_notice_version: PRIVACY_NOTICE_VERSION,
          receipt_scanning_enabled: receiptScanningEnabled,
          receipt_scanning_consent_version: receiptScanningEnabled
            ? RECEIPT_SCANNING_CONSENT_VERSION
            : null,
        },
        emailRedirectTo: inviteToken
          ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/join?token=${inviteToken}`)}`
          : `${window.location.origin}/auth/callback?next=/onboard`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // If session is present, email confirmation is disabled -- go straight in.
    // If session is null, Supabase sent a confirmation email -- show inbox prompt.
    if (data.session) {
      router.push(inviteToken ? `/join?token=${inviteToken}` : '/onboard')
    } else {
      setAwaitingVerification(true)
      setLoading(false)
    }
  }

  // ── Awaiting email verification ──────────────────────────────────────────────
  if (awaitingVerification) {
    return (
      <div className="w-full max-w-sm">
        <div className="card p-8 text-center">
          <span className="text-5xl">📧</span>
          <h2 className="mt-4 text-xl font-semibold text-gray-900">{t('checkEmail.title')}</h2>
          <p className="mt-2 text-sm text-gray-500">
            {t('checkEmail.body', { email })}
          </p>
          <p className="mt-4 text-xs text-gray-400">{t('checkEmail.hint')}</p>
          <Link
            href="/login"
            className="mt-6 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            {t('signIn')}
          </Link>
        </div>
      </div>
    )
  }

  // ── Signup form ──────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-sm">
      <div className="card p-8">
        <h2 className="mb-6 text-xl font-semibold text-gray-900">{t('title')}</h2>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              {t('yourName')}
            </label>
            <input
              id="name"
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-base"
              placeholder={t('namePlaceholder')}
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              {tc('email')}
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-base"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              {tc('password')}
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-base pr-10"
                placeholder={t('passwordPlaceholder')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
              {t('confirmPassword')}
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-base pr-10"
                placeholder={t('passwordPlaceholder')}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                <EyeIcon open={showConfirm} />
              </button>
            </div>
          </div>

          <div className="space-y-3 border-t border-gray-200 pt-4">
            <p className="text-xs leading-5 text-gray-500">
              {t('privacyNoticeLead')}{' '}
              <Link href="/privacy" target="_blank" className="font-medium text-indigo-700 underline hover:text-indigo-900">
                {t('privacyNotice')}
              </Link>
              .
            </p>

            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={receiptScanningEnabled}
                onChange={(event) => setReceiptScanningEnabled(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                <span className="block text-sm font-medium text-gray-700">{t('receiptScanningTitle')}</span>
                <span className="mt-0.5 block text-xs leading-5 text-gray-500">{t('receiptScanningBody')}</span>
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white
                       shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2
                       focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50
                       disabled:cursor-not-allowed transition"
          >
            {loading ? t('creatingAccount') : t('createAccount')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          {t('alreadyHaveAccount')}{' '}
          <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-700">
            {t('signIn')}
          </Link>
        </p>
      </div>
    </div>
  )
}

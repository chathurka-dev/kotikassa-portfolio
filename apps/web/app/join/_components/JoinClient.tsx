'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createClient } from '@kotikassa/shared'

interface Props {
  token: string
  preview: Record<string, string> | null
  isLoggedIn: boolean
  hasFamily: boolean
}

type InviteError = 'invalid_token' | 'expired' | 'already_used' | 'already_in_family' | 'not_authenticated' | 'unknown'

function errorKey(code: string): InviteError {
  const known: InviteError[] = ['invalid_token', 'expired', 'already_used', 'already_in_family', 'not_authenticated']
  return known.includes(code as InviteError) ? (code as InviteError) : 'unknown'
}

export default function JoinClient({ token, preview, isLoggedIn, hasFamily }: Props) {
  const t = useTranslations('join')
  const router = useRouter()
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<InviteError | null>(null)
  const [success, setSuccess] = useState(false)

  const supabase = createClient()

  const previewError = preview?.error ? errorKey(preview.error) : null
  const familyName = preview?.family_name ?? null

  async function handleJoin() {
    setJoining(true)
    setError(null)

    const { data } = await supabase.rpc('use_invite', { p_token: token })
    const result = data as Record<string, string> | null

    if (result?.error) {
      setError(errorKey(result.error))
      setJoining(false)
      return
    }

    setSuccess(true)
    // Small delay so the user sees the success state before redirect
    setTimeout(() => {
      router.push('/')
      router.refresh()
    }, 1200)
  }

  // ── Invite is invalid / expired / already used ──────────────────────────────
  if (previewError) {
    return (
      <Layout>
        <div className="text-center">
          <span className="text-5xl">{previewError === 'expired' ? '⏰' : '❌'}</span>
          <h1 className="mt-4 text-xl font-bold text-gray-900">{t(`error.${previewError}.title`)}</h1>
          <p className="mt-2 text-sm text-gray-500">{t(`error.${previewError}.body`)}</p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition"
          >
            {t('goToLogin')}
          </Link>
        </div>
      </Layout>
    )
  }

  // ── Already in a family ──────────────────────────────────────────────────────
  if (hasFamily) {
    return (
      <Layout>
        <div className="text-center">
          <span className="text-5xl">🏠</span>
          <h1 className="mt-4 text-xl font-bold text-gray-900">{t('alreadyInFamily.title')}</h1>
          <p className="mt-2 text-sm text-gray-500">{t('alreadyInFamily.body')}</p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition"
          >
            {t('goToDashboard')}
          </Link>
        </div>
      </Layout>
    )
  }

  // ── Success state ────────────────────────────────────────────────────────────
  if (success) {
    return (
      <Layout>
        <div className="text-center">
          <span className="text-5xl">🎉</span>
          <h1 className="mt-4 text-xl font-bold text-gray-900">{t('success.title', { family: familyName ?? '' })}</h1>
          <p className="mt-2 text-sm text-gray-500">{t('success.body')}</p>
        </div>
      </Layout>
    )
  }

  // ── Not logged in ────────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <Layout>
        <div className="text-center">
          <span className="text-5xl">🤝</span>
          <h1 className="mt-4 text-xl font-bold text-gray-900">{t('invited.title')}</h1>
          <p className="mt-2 text-base font-semibold text-indigo-700">{familyName}</p>
          <p className="mt-2 text-sm text-gray-500">{t('invited.needsAccount')}</p>
          <div className="mt-6 flex flex-col gap-3">
            <Link
              href={`/signup?invite=${encodeURIComponent(token)}`}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition text-center"
            >
              {t('invited.signUp')}
            </Link>
            <Link
              href={`/login?redirectTo=/join%3Ftoken%3D${encodeURIComponent(token)}`}
              className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition text-center"
            >
              {t('invited.logIn')}
            </Link>
          </div>
        </div>
      </Layout>
    )
  }

  // ── Logged in, no family — show accept button ────────────────────────────────
  return (
    <Layout>
      <div className="text-center">
        <span className="text-5xl">🤝</span>
        <h1 className="mt-4 text-xl font-bold text-gray-900">{t('accept.title')}</h1>
        <p className="mt-2 text-base font-semibold text-indigo-700">{familyName}</p>
        <p className="mt-2 text-sm text-gray-500">{t('accept.body')}</p>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            {t(`error.${error}.title`)}
          </div>
        )}

        <button
          onClick={handleJoin}
          disabled={joining}
          className="mt-6 w-full rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white
                     hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {joining ? t('accept.joining') : t('accept.cta', { family: familyName ?? '' })}
        </button>
      </div>
    </Layout>
  )
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-indigo-50 to-white px-4">
      <div className="mb-8 text-center">
        <span className="text-3xl font-bold text-indigo-700">Kotikassa</span>
      </div>
      <div className="card w-full max-w-sm p-8">
        {children}
      </div>
    </div>
  )
}

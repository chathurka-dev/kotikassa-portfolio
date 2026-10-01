'use client'

// Onboarding — runs once after first signup.
// Creates the family and seeds default categories.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient, DEFAULT_CATEGORIES, PRIVACY_NOTICE_VERSION } from '@kotikassa/shared'

export default function OnboardPage() {
  const router = useRouter()
  const t = useTranslations('onboard')
  const [familyName, setFamilyName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [privacyReady, setPrivacyReady] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    let active = true

    async function checkPrivacyChoice() {
      const client = createClient()
      const { data: { user } } = await client.auth.getUser()
      if (!user) {
        if (active) setPrivacyReady(true)
        return
      }

      const { data: choice } = await client
        .from('user_privacy_choices')
        .select('privacy_notice_version')
        .eq('user_id', user.id)
        .maybeSingle()

      if (choice?.privacy_notice_version !== PRIVACY_NOTICE_VERSION) {
        router.replace('/privacy/consent?next=/onboard')
        return
      }
      if (active) setPrivacyReady(true)
    }

    void checkPrivacyChoice()
    return () => { active = false }
  }, [router])

  if (!privacyReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    )
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError(t('notSignedIn'))
      setLoading(false)
      return
    }

    // 1. Create the family — generate UUID client-side to avoid RLS chicken-and-egg:
    // the SELECT policy requires auth_family_id() but the profile isn't linked yet.
    const familyId = crypto.randomUUID()
    const { error: familyError } = await supabase
      .from('families')
      .insert({ id: familyId, name: familyName.trim() })

    if (familyError) {
      console.error('Family insert error:', familyError)
      setError(t('familyError', { message: familyError.message, code: familyError.code }))
      setLoading(false)
      return
    }

    // 2. Link the user's profile to this family and make them admin
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ family_id: familyId, role: 'admin' })
      .eq('id', user.id)

    if (profileError) {
      console.error('Profile update error:', profileError)
      setError(t('profileError', { message: profileError.message, code: profileError.code }))
      setLoading(false)
      return
    }

    // 3. Seed default categories for this family
    const categoryRows = DEFAULT_CATEGORIES.map((cat) => ({
      family_id: familyId,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      sort_order: cat.sort_order,
    }))

    const { error: catError } = await supabase.from('categories').insert(categoryRows)

    if (catError) {
      // Non-fatal — they can add categories manually
      console.warn('Category seed failed:', catError.message)
    }

    // All done — go to dashboard
    router.push('/')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-indigo-50 to-white px-4">
      <div className="mb-8 text-center">
        <span className="text-4xl">🏠</span>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{t('welcome')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
      </div>

      <div className="card w-full max-w-sm p-8">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">{t('nameYourFamily')}</h2>
        <p className="mb-6 text-sm text-gray-500">
          {t('nameHint')}
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label htmlFor="familyName" className="block text-sm font-medium text-gray-700 mb-1">
              {t('familyName')}
            </label>
            <input
              id="familyName"
              type="text"
              required
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              className="input-base"
              placeholder={t('familyNamePlaceholder')}
              maxLength={60}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !familyName.trim()}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white
                       shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2
                       focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50
                       disabled:cursor-not-allowed transition"
          >
            {loading ? t('creating') : t('createFamily')}
          </button>
        </form>
      </div>
    </div>
  )
}

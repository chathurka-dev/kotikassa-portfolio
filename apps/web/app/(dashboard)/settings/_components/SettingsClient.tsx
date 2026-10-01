'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createClient, SUPPORTED_CURRENCIES } from '@kotikassa/shared'
import { Copy, Check, Trash2, LogOut, AlertTriangle, ShieldCheck } from 'lucide-react'
import { usePreferences } from '@/hooks/usePreferences'
import { deleteFamilyAction, leaveFamilyAction } from '../actions'

interface Profile { family_id: string | null; display_name: string; role: string }
interface Family { id: string; name: string; currency: string }
interface Member { id: string; display_name: string; role: string }

interface Props {
  userId: string
  userEmail: string
  profile: Profile
  family: Family
  members: Member[]
}

// ── Confirmation modal ───────────────────────────────────────────────────────
function ConfirmDeleteModal({
  title, description, confirmWord, onConfirm, onCancel, danger = true,
}: {
  title: string
  description: string
  confirmWord: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}) {
  const [typed, setTyped] = useState('')
  const [pending, startTransition] = useTransition()
  const t = useTranslations('settings')

  function handleConfirm() {
    if (typed !== confirmWord) return
    startTransition(() => { onConfirm() })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-3">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <h3 className="font-semibold text-gray-900">{title}</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">{description}</p>
        <p className="text-xs text-gray-500 mb-1">
          {t('typeToConfirm', { word: confirmWord })}
        </p>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onPaste={(e) => e.preventDefault()}
          autoComplete="off"
          className="input-base mb-4"
          placeholder={confirmWord}
        />
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-600 hover:bg-gray-50">
            {t('cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={typed !== confirmWord || pending}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold text-white transition disabled:opacity-40
              ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {pending ? t('deleting') : t('confirmDelete')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SettingsClient({ userId, userEmail, profile, family, members }: Props) {
  const t = useTranslations('settings')
  const tc = useTranslations('common')
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [familyName, setFamilyName] = useState(family.name)
  const [selectedCurrency, setSelectedCurrency] = useState(family.currency ?? 'EUR')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingFamily, setSavingFamily] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const supabase = createClient()
  const router = useRouter()
  const isAdmin = profile.role === 'admin'
  const [saveError, setSaveError] = useState<string | null>(null)
  const { prefs, loading: prefsLoading, update: updatePref } = usePreferences(userId)

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)
    setSavingProfile(true)
    const { error } = await supabase.from('profiles').update({ display_name: displayName.trim() }).eq('id', userId)
    setSavingProfile(false)
    if (error) {
      setSaveError(t('saveFailed'))
    } else {
      setMessage(t('profileSaved'))
      setTimeout(() => setMessage(null), 2000)
    }
  }

  async function handleSaveFamily(e: React.FormEvent) {
    e.preventDefault()
    if (!isAdmin) return
    setSaveError(null)
    setSavingFamily(true)
    const { error } = await supabase.from('families').update({ name: familyName.trim(), currency: selectedCurrency }).eq('id', family.id)
    setSavingFamily(false)
    if (error) {
      setSaveError(t('saveFailed'))
    } else {
      setMessage(t('familySaved'))
      setTimeout(() => setMessage(null), 2000)
      router.refresh()
    }
  }

  async function generateInvite() {
    const { data } = await supabase
      .from('family_invites')
      .insert({ family_id: family.id, created_by: userId })
      .select('token')
      .single()
    if (data) {
      setInviteLink(`${window.location.origin}/join?token=${data.token}`)
    }
  }

  async function copyInvite() {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDeleteConfirmed() {
    setActionError(null)
    if (isAdmin) {
      const result = await deleteFamilyAction(family.id)
      if (result?.error) { setActionError(result.error); setShowDeleteModal(false) }
    } else {
      const result = await leaveFamilyAction()
      if (result?.error) { setActionError(result.error); setShowDeleteModal(false) }
    }
  }

  const dangerTitle = isAdmin ? t('deleteFamilyTitle') : t('leaveFamilyTitle')
  const dangerDescription = isAdmin ? t('deleteFamilyDescription') : t('leaveFamilyDescription')
  const dangerButton = isAdmin ? t('deleteFamily') : t('leaveFamily')

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>

      {message && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 border border-green-200">{message}</div>
      )}
      {saveError && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">{saveError}</div>
      )}

      {/* Profile */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">{t('yourProfile')}</h2>
        <form onSubmit={handleSaveProfile} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('displayName')}</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input-base" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{tc('email')}</label>
            <input type="email" value={userEmail} disabled className="input-base" />
          </div>
          <button type="submit" disabled={savingProfile}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition">
            {savingProfile ? t('saving') : t('saveProfile')}
          </button>
        </form>
      </div>

      {/* Family */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">{t('family')}</h2>
        <form onSubmit={handleSaveFamily} className="space-y-3 mb-5">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('familyName')}</label>
            <input type="text" value={familyName} onChange={(e) => setFamilyName(e.target.value)}
              disabled={!isAdmin} className="input-base" />
            {!isAdmin && <p className="text-xs text-gray-400 mt-1">{t('adminOnly')}</p>}
          </div>
          {isAdmin && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('currencyLabel')}</label>
              <select
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value)}
                className="input-base"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">{t('currencyHint')}</p>
            </div>
          )}
          {isAdmin && (
            <button type="submit" disabled={savingFamily}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition">
              {savingFamily ? t('saving') : t('saveName')}
            </button>
          )}
        </form>

        <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('members')}</h3>
        <ul className="space-y-1 mb-4">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
              <span className="text-sm text-gray-900">{m.display_name || t('noName')}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                ${m.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                {m.role}
              </span>
            </li>
          ))}
        </ul>

        {isAdmin && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('inviteSomeone')}</h3>
            <p className="text-xs text-gray-500 mb-3">{t('inviteHint')}</p>
            <button onClick={generateInvite}
              className="rounded-lg border border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 transition">
              {t('generateInvite')}
            </button>
            {inviteLink && (
              <div className="mt-3 flex items-center gap-2">
                <input readOnly value={inviteLink} className="input-base flex-1 text-xs" />
                <button onClick={copyInvite}
                  className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200 transition">
                  {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? t('copied') : t('copy')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Privacy */}
      <div className="card p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <ShieldCheck className="h-4 w-4 text-indigo-600" />
          {t('privacyTitle')}
        </h2>
        <p className="mt-1 text-sm text-gray-500">{t('privacyHint')}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/privacy" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            {t('viewPrivacyNotice')}
          </Link>
          <Link href="/privacy/consent?next=/settings" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            {t('managePrivacyChoices')}
          </Link>
        </div>
      </div>

      {/* Display preferences */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">{t('displayPreferences')}</h2>
        <p className="text-xs text-gray-500 mb-4">{t('displayPreferencesHint')}</p>
        {prefsLoading ? (
          <div className="h-10 animate-pulse rounded-lg bg-gray-100" />
        ) : (
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-gray-900">{t('showWeekFilter')}</p>
                <p className="text-xs text-gray-500">{t('showWeekFilterHint')}</p>
              </div>
              <button role="switch" aria-checked={prefs.showWeekFilter}
                onClick={() => updatePref({ showWeekFilter: !prefs.showWeekFilter })}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent
                  transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                  ${prefs.showWeekFilter ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow
                  ring-0 transition duration-200 ease-in-out ${prefs.showWeekFilter ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </label>
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <p className="text-sm font-medium text-gray-900">{t('showStoreFilter')}</p>
                <p className="text-xs text-gray-500">{t('showStoreFilterHint')}</p>
              </div>
              <button role="switch" aria-checked={prefs.showStoreFilter}
                onClick={() => updatePref({ showStoreFilter: !prefs.showStoreFilter })}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent
                  transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                  ${prefs.showStoreFilter ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow
                  ring-0 transition duration-200 ease-in-out ${prefs.showStoreFilter ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </label>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">{t('budgetStartDay')}</p>
                <p className="text-xs text-gray-500">{t('budgetStartDayHint')}</p>
              </div>
              <select
                value={prefs.budgetStartDay}
                onChange={(e) => updatePref({ budgetStartDay: Number(e.target.value) })}
                className="input-base w-20 text-sm"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h2 className="text-base font-semibold text-red-700 mb-1 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />{t('dangerZone')}
        </h2>
        <p className="text-sm text-red-600 mb-4">{dangerDescription}</p>
        {actionError && (
          <div className="mb-3 rounded-lg border border-red-300 bg-white p-2 text-xs text-red-700">{actionError}</div>
        )}
        <button onClick={() => setShowDeleteModal(true)}
          className="flex items-center gap-2 rounded-lg border border-red-400 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 transition">
          {isAdmin ? <Trash2 className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
          {dangerButton}
        </button>
      </div>

      {showDeleteModal && (
        <ConfirmDeleteModal
          title={dangerTitle}
          description={dangerDescription}
          confirmWord="DELETE"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  )
}

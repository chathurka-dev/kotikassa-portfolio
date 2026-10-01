import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'
import Sidebar from '@/components/Sidebar'
import { CurrencyProvider } from '@/lib/currency-context'
import { getFamily } from '@/lib/family'
import { PRIVACY_NOTICE_VERSION } from '@kotikassa/shared'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()

  if (!session) redirect('/onboard')
  if (!session.profile.family_id) redirect('/onboard')

  const { data: privacyChoice } = await session.supabase
    .from('user_privacy_choices')
    .select('privacy_notice_version')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (privacyChoice?.privacy_notice_version !== PRIVACY_NOTICE_VERSION) {
    redirect('/privacy/consent')
  }

  const family = await getFamily()

  return (
    <CurrencyProvider currency={family?.currency ?? 'EUR'}>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar
          familyName={family?.name ?? ''}
          userEmail={session.user.email ?? ''}
          displayName={session.profile.display_name}
        />
        <main className="flex-1 overflow-auto min-w-0 pt-14 lg:pt-0">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
        </main>
      </div>
    </CurrencyProvider>
  )
}

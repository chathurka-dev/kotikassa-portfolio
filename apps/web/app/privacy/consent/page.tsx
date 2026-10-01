import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import {
  createSupabaseServerClient,
  PRIVACY_NOTICE_VERSION,
  RECEIPT_TRAINING_CONSENT_VERSION,
} from '@kotikassa/shared'
import PrivacyChoices from './PrivacyChoices'

export const dynamic = 'force-dynamic'

function safeNext(value: string | undefined): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/'
}

export default async function PrivacyConsentPage({
  searchParams,
}: {
  searchParams?: { next?: string }
}) {
  const supabase = createSupabaseServerClient(await cookies())
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent('/privacy/consent')}`)

  const { data: choice } = await supabase
    .from('user_privacy_choices')
    .select('privacy_notice_version, privacy_notice_shown_at, receipt_scanning_enabled, receipt_scanning_consented_at, receipt_training_enabled, receipt_training_choice_version, receipt_training_choice_at, receipt_training_consented_at, receipt_training_prompt_count')
    .eq('user_id', user.id)
    .maybeSingle()

  return (
    <PrivacyChoices
      nextPath={safeNext(searchParams?.next)}
      noticeIsCurrent={choice?.privacy_notice_version === PRIVACY_NOTICE_VERSION}
      privacyNoticeShownAt={choice?.privacy_notice_shown_at ?? null}
      receiptScanningEnabled={choice?.receipt_scanning_enabled ?? false}
      receiptScanningConsentedAt={choice?.receipt_scanning_consented_at ?? null}
      receiptTrainingChoiceMade={Boolean(
        choice?.receipt_training_choice_at || choice?.receipt_training_prompt_count
      )}
      receiptTrainingChoiceIsCurrent={choice?.receipt_training_choice_version === RECEIPT_TRAINING_CONSENT_VERSION}
      receiptTrainingEnabled={choice?.receipt_training_enabled ?? false}
      receiptTrainingConsentedAt={choice?.receipt_training_consented_at ?? null}
    />
  )
}

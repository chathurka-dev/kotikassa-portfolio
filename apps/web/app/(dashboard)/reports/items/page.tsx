import { redirect } from 'next/navigation'

export default function LegacyItemReportsPage() {
  redirect('/reports?type=item-purchases')
}

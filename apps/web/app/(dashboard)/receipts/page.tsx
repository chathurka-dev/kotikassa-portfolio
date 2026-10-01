import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'
import ReceiptHistoryClient, { type ReceiptHistoryEntry } from './_components/ReceiptHistoryClient'

export const dynamic = 'force-dynamic'

export default async function ReceiptsPage() {
  const session = await getServerSession()
  if (!session) redirect('/login')

  const { familyId, supabase } = session
  const { data: receipts, error } = await supabase
    .from('receipts')
    .select('id, store_name, receipt_date, total_amount, image_url, created_at')
    .eq('family_id', familyId)
    .order('receipt_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('[receipts] history load failed:', error.message, error.details)
  }

  const receiptIds = (receipts ?? []).map((receipt) => receipt.id)
  const itemCounts = new Map<string, number>()

  if (receiptIds.length > 0) {
    const { data: items, error: itemError } = await supabase
      .from('expense_items')
      .select('receipt_id')
      .eq('family_id', familyId)
      .in('receipt_id', receiptIds)

    if (itemError) {
      console.error('[receipts] item count load failed:', itemError.message, itemError.details)
    } else {
      for (const item of items ?? []) {
        if (!item.receipt_id) continue
        itemCounts.set(item.receipt_id, (itemCounts.get(item.receipt_id) ?? 0) + 1)
      }
    }
  }

  const entries: ReceiptHistoryEntry[] = (receipts ?? []).map((receipt) => ({
    ...receipt,
    itemCount: itemCounts.get(receipt.id) ?? 0,
  }))

  return (
    <ReceiptHistoryClient
      initialReceipts={entries}
      familyId={familyId}
      loadFailed={Boolean(error)}
    />
  )
}

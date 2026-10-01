import { cookies } from 'next/headers'
import { createSupabaseServerClient, RECEIPT_SCANNING_CONSENT_VERSION } from '@kotikassa/shared'
import ReceiptScanner from './_components/ReceiptScanner'

export const dynamic = 'force-dynamic'

export default async function ScanPage() {
  const cookieStore = await cookies()
  const supabase = createSupabaseServerClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', user!.id)
    .single()

  const familyId = profile!.family_id!

  const { data: privacyChoice } = await supabase
    .from('user_privacy_choices')
    .select('receipt_scanning_enabled, receipt_scanning_consent_version')
    .eq('user_id', user!.id)
    .maybeSingle()

  const receiptScanningEnabled = Boolean(
    privacyChoice?.receipt_scanning_enabled &&
    privacyChoice.receipt_scanning_consent_version === RECEIPT_SCANNING_CONSENT_VERSION
  )

  // Fetch categories for the review screen dropdowns
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, icon, color')
    .eq('family_id', familyId)
    .order('sort_order')

  // Fetch family's item-category memory (product name → category_id)
  const { data: memory } = await supabase
    .from('item_category_memory')
    .select('item_name, category_id, confidence_score, support_count, rejection_count')
    .eq('family_id', familyId)
    .gte('confidence_score', 0.8)
    .gte('support_count', 3)
    .eq('rejection_count', 0)

  const memoryMap: Record<string, string> = {}
  for (const row of memory ?? []) {
    memoryMap[row.item_name.toLowerCase()] = row.category_id
  }

  // Fetch distinct store names for autocomplete
  const { data: storeRows } = await supabase
    .from('receipts')
    .select('store_name')
    .eq('family_id', familyId)
    .not('store_name', 'is', null)
    .order('receipt_date', { ascending: false })
    .limit(500)

  const storeNames = [
    ...new Set((storeRows ?? []).map((r) => r.store_name as string).filter(Boolean)),
  ]

  // Build quick-add + autocomplete suggestions from the family's item history.
  // Newest-first so the first row seen for each name carries its most recent price/category.
  const { data: history } = await supabase
    .from('expense_items')
    .select('name, amount, category_id, expense_date')
    .eq('family_id', familyId)
    .order('expense_date', { ascending: false })
    .limit(3000)

  const suggestionMap = new Map<
    string,
    { name: string; lastPrice: number; categoryId: string | null; count: number }
  >()
  for (const row of history ?? []) {
    const rawName = (row.name ?? '').trim()
    if (!rawName) continue
    const key = rawName.toLowerCase()
    const existing = suggestionMap.get(key)
    if (existing) {
      existing.count += 1
    } else {
      suggestionMap.set(key, {
        name: rawName,
        lastPrice: row.amount,
        categoryId: row.category_id ?? null,
        count: 1,
      })
    }
  }
  const suggestions = Array.from(suggestionMap.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  )

  return (
    <ReceiptScanner
      familyId={familyId}
      userId={user!.id}
      categories={categories ?? []}
      memoryMap={memoryMap}
      suggestions={suggestions}
      storeNames={storeNames}
      receiptScanningEnabled={receiptScanningEnabled}
    />
  )
}

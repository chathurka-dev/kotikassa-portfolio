import { redirect } from 'next/navigation'
import { resolvePreferences } from '@kotikassa/shared'
import { getServerSession } from '@/lib/auth'
import type { ReportFilterOptions } from '@/lib/report-contract'
import { resolveReportViewState, type ReportQueryInput } from '@/lib/report-view-state'
import ReportsClient from './_components/ReportsClient'

export const dynamic = 'force-dynamic'

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<ReportQueryInput>
}) {
  const [session, params] = await Promise.all([getServerSession(), searchParams])
  if (!session) redirect('/login')

  const { familyId, profile, supabase } = session
  const [
    { data: categories },
    { data: receiptStores },
    { data: catalogItems },
    { data: aliases },
    { data: people },
  ] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, icon')
      .eq('family_id', familyId)
      .order('sort_order'),
    supabase
      .from('receipts')
      .select('store_name')
      .eq('family_id', familyId)
      .not('store_name', 'is', null)
      .order('store_name')
      .limit(2000),
    supabase
      .from('catalog_items')
      .select('id, canonical_name')
      .eq('family_id', familyId)
      .order('canonical_name')
      .limit(3000),
    supabase
      .from('catalog_item_aliases')
      .select('id, catalog_item_id, alias_name')
      .eq('family_id', familyId)
      .order('alias_name')
      .limit(5000),
    supabase.from('people').select('id, name').eq('family_id', familyId).order('name'),
  ])

  const aliasesByItem = new Map<string, Array<{ id: string; name: string }>>()
  for (const alias of aliases ?? []) {
    const current = aliasesByItem.get(alias.catalog_item_id) ?? []
    current.push({ id: alias.id, name: alias.alias_name })
    aliasesByItem.set(alias.catalog_item_id, current)
  }

  const options: ReportFilterOptions = {
    categories: categories ?? [],
    stores: [
      ...new Set(
        (receiptStores ?? [])
          .map((row) => row.store_name)
          .filter((name): name is string => Boolean(name?.trim()))
      ),
    ],
    items: (catalogItems ?? []).map((item) => ({
      id: item.id,
      name: item.canonical_name,
      aliases: aliasesByItem.get(item.id) ?? [],
    })),
    people: people ?? [],
  }
  const budgetStartDay = resolvePreferences(profile.preferences).budgetStartDay
  const requestedState = resolveReportViewState(params, budgetStartDay)
  const initialState = {
    ...requestedState,
    filters: {
      categoryId: options.categories.some(
        (category) => category.id === requestedState.filters.categoryId
      )
        ? requestedState.filters.categoryId
        : '',
      store: options.stores.includes(requestedState.filters.store)
        ? requestedState.filters.store
        : '',
      itemId: options.items.some((item) => item.id === requestedState.filters.itemId)
        ? requestedState.filters.itemId
        : '',
      personId: options.people.some((person) => person.id === requestedState.filters.personId)
        ? requestedState.filters.personId
        : '',
    },
  }

  return (
    <ReportsClient
      initialState={initialState}
      initialOptions={options}
      budgetStartDay={budgetStartDay}
    />
  )
}

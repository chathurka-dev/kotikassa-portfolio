import { cache } from 'react'
import { getServerSession } from './auth'

/** Fetches the current family row once per request; deduplicates across layout + page. */
export const getFamily = cache(async (): Promise<{ id: string; name: string; currency: string } | null> => {
  const session = await getServerSession()
  if (!session) return null
  const { data } = await session.supabase
    .from('families')
    .select('id, name, currency')
    .eq('id', session.familyId)
    .single()
  return data ?? null
})

'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient, resolvePreferences, type ResolvedPreferences, type UserPreferences } from '@kotikassa/shared'

/**
 * Reads and writes user preferences from/to profiles.preferences (Supabase JSONB).
 * Pass `initial` to seed state from server-fetched props (avoids loading flash);
 * the hook always re-fetches on mount so stale server values are corrected immediately.
 */
export function usePreferences(userId: string, initial?: ResolvedPreferences) {
  const supabase = createClient()
  const [prefs, setPrefs] = useState<ResolvedPreferences>(initial ?? resolvePreferences({}))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase
      .from('profiles')
      .select('preferences')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (!active) return
        if (data?.preferences) setPrefs(resolvePreferences(data.preferences))
        setLoading(false)
      })
    return () => { active = false }
  }, [userId])

  const update = useCallback(async (patch: Partial<UserPreferences>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)  // optimistic update
    await supabase
      .from('profiles')
      .update({ preferences: next })
      .eq('id', userId)
  }, [prefs, userId])

  return { prefs, loading, update }
}

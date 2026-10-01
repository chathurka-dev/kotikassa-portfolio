import { useCallback, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'

// Shared screen-loading orchestration: runs `load` on every focus, exposes
// pull-to-refresh state, and hands `load` an isStale() check so responses
// that finish after a newer load started can be discarded.
export function useFocusRefresh(load: (isStale: () => boolean) => Promise<void>) {
  const requestIdRef = useRef(0)
  const [refreshing, setRefreshing] = useState(false)

  const run = useCallback(async () => {
    const requestId = ++requestIdRef.current
    try {
      await load(() => requestId !== requestIdRef.current)
    } catch (err) {
      console.error('[screen] load failed:', err)
    }
  }, [load])

  useFocusEffect(
    useCallback(() => {
      run()
    }, [run])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await run()
    } finally {
      setRefreshing(false)
    }
  }, [run])

  return { refreshing, onRefresh }
}

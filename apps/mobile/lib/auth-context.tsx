// ============================================================
// Auth context — mirrors getServerSession() on web:
// exposes { session, profile, familyId } plus loading state.
// ============================================================
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '@kotikassa/shared/native'
import { supabase } from './supabase'

interface AuthState {
  session: Session | null
  profile: Profile | null
  familyId: string | null
  loading: boolean
  profileError: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState(false)
  const [loading, setLoading] = useState(true)
  const loadedUserIdRef = useRef<string | null>(null)

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (error) {
      // Distinguish "fetch failed" from "no profile": on failure keep the
      // previous profile and flag the error so AuthGate does not treat the
      // user as unonboarded (they could otherwise create a second family).
      console.error('[auth] profile load failed:', error.message)
      setProfileError(true)
      return
    }
    loadedUserIdRef.current = userId
    setProfileError(false)
    setProfile((data as Profile | null) ?? null)
  }, [])

  useEffect(() => {
    let mounted = true
    // supabase-js v2 emits INITIAL_SESSION on subscribe, so one listener
    // covers cold start, sign-in/out, and token refreshes.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return
        setSession(session)
        if (!session?.user) {
          loadedUserIdRef.current = null
          setProfile(null)
        } else if (loadedUserIdRef.current !== session.user.id) {
          // Token refreshes fire this too — only refetch when the user changed
          // or the previous profile load failed.
          await loadProfile(session.user.id)
        }
        if (mounted) setLoading(false)
      }
    )
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return
    loadedUserIdRef.current = null
    await loadProfile(session.user.id)
  }, [session, loadProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        familyId: profile?.family_id ?? null,
        loading,
        profileError,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

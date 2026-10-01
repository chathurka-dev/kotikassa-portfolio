import '../global.css'
import { useEffect } from 'react'
import { View, ActivityIndicator, Text, TouchableOpacity } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import { CurrencyProvider } from '@/lib/currency-context'
import { I18nProvider, useT } from '@/lib/i18n'

// Route guard: unauthenticated → /login, no family yet → /onboard, else → tabs.
function AuthGate() {
  const { session, familyId, loading, profileError, refreshProfile } = useAuth()
  const t = useT('mobile')
  const segments = useSegments()
  const router = useRouter()

  // A failed profile load must not route to onboarding: the user may already
  // have a family, and completing onboarding again would replace it.
  const profileUnavailable = !!session && !familyId && profileError

  useEffect(() => {
    if (loading || profileUnavailable) return
    const inAuthGroup = segments[0] === '(auth)'
    const inOnboard = segments[0] === 'onboard'

    if (!session && !inAuthGroup) {
      router.replace('/login')
    } else if (session && !familyId && !inOnboard) {
      router.replace('/onboard')
    } else if (session && familyId && (inAuthGroup || inOnboard)) {
      router.replace('/')
    }
  }, [session, familyId, loading, profileUnavailable, segments, router])

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    )
  }

  if (profileUnavailable) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-8">
        <Text className="text-sm text-gray-600 text-center">{t('profileLoadError')}</Text>
        <TouchableOpacity
          onPress={() => refreshProfile()}
          className="mt-4 rounded-lg bg-indigo-600 px-5 py-2.5"
        >
          <Text className="text-sm font-semibold text-white">{t('retry')}</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="onboard" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <I18nProvider>
      <AuthProvider>
        <CurrencyProvider>
          <StatusBar style="dark" />
          <AuthGate />
        </CurrencyProvider>
      </AuthProvider>
    </I18nProvider>
  )
}

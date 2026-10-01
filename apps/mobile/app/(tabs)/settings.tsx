// Settings — account info, family, budget preferences, language, sign out.
import { useCallback, useState } from 'react'
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import Constants from 'expo-constants'
import { resolvePreferences } from '@kotikassa/shared/native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { useCurrency } from '@/lib/currency-context'
import { useLocale, useT, type Locale } from '@/lib/i18n'
import { Card } from '@/components/ui'

export default function SettingsScreen() {
  const t = useT('settings')
  const tm = useT('mobile')
  const { session, profile, familyId, signOut, refreshProfile } = useAuth()
  const currency = useCurrency()
  const { locale, setLocale } = useLocale()
  const [familyName, setFamilyName] = useState<string | null>(null)

  const prefs = resolvePreferences(profile?.preferences)

  useFocusEffect(
    useCallback(() => {
      if (!familyId) return
      supabase
        .from('families')
        .select('name')
        .eq('id', familyId)
        .single()
        .then(({ data }) => setFamilyName(data?.name ?? null))
    }, [familyId])
  )

  async function updateBudgetStartDay(day: number) {
    if (!session?.user.id) return
    const newPrefs = { ...(profile?.preferences as object | null ?? {}), budgetStartDay: day }
    const { error } = await supabase.from('profiles').update({ preferences: newPrefs }).eq('id', session.user.id)
    if (error) {
      Alert.alert(t('title'), t('saveFailed'))
      return
    }
    await refreshProfile()
  }

  function confirmSignOut() {
    Alert.alert(tm('signOut'), tm('signOutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: tm('signOut'), style: 'destructive', onPress: () => signOut() },
    ])
  }

  const languages: { code: Locale; label: string }[] = [
    { code: 'fi', label: 'Suomi' },
    { code: 'en', label: 'English' },
  ]

  const day = prefs.budgetStartDay

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView contentContainerClassName="p-4 pb-8">
        <Text className="text-2xl font-bold text-gray-900 mb-4">{t('title')}</Text>

        {/* Account */}
        <Card className="mb-3">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            {tm('account')}
          </Text>
          <Text className="text-sm font-medium text-gray-900">
            {profile?.display_name ?? t('noName')}
          </Text>
          <Text className="text-xs text-gray-400 mt-0.5">{session?.user.email}</Text>
        </Card>

        {/* Family */}
        <Card className="mb-3">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            {tm('family')}
          </Text>
          <Text className="text-sm font-medium text-gray-900">{familyName ?? '—'}</Text>
          <Text className="text-xs text-gray-400 mt-0.5">
            {t('currencyLabel')}: {currency}
          </Text>
        </Card>

        {/* Budget period start day */}
        <Card className="mb-3">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            {t('budgetPeriodSection')}
          </Text>
          <Text className="text-xs text-gray-400 mb-3">{t('budgetStartDayHint')}</Text>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-medium text-gray-900">{t('budgetStartDay')}</Text>
            <View className="flex-row items-center gap-3">
              <TouchableOpacity
                onPress={() => day > 1 && updateBudgetStartDay(day - 1)}
                className={`w-9 h-9 rounded-full items-center justify-center bg-gray-100 ${day <= 1 ? 'opacity-30' : ''}`}
                disabled={day <= 1}
              >
                <Text className="text-lg font-semibold text-gray-600">−</Text>
              </TouchableOpacity>
              <Text className="text-base font-bold text-gray-900 w-6 text-center">{day}</Text>
              <TouchableOpacity
                onPress={() => day < 28 && updateBudgetStartDay(day + 1)}
                className={`w-9 h-9 rounded-full items-center justify-center bg-gray-100 ${day >= 28 ? 'opacity-30' : ''}`}
                disabled={day >= 28}
              >
                <Text className="text-lg font-semibold text-gray-600">+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card>

        {/* Language */}
        <Card className="mb-3">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            {tm('language')}
          </Text>
          <View className="flex-row gap-2">
            {languages.map((l) => (
              <TouchableOpacity
                key={l.code}
                onPress={() => setLocale(l.code)}
                className={`rounded-full border px-4 py-2 ${locale === l.code ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-200'}`}
              >
                <Text className={`text-sm font-medium ${locale === l.code ? 'text-white' : 'text-gray-600'}`}>
                  {l.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Sign out */}
        <TouchableOpacity
          onPress={confirmSignOut}
          className="rounded-2xl border border-red-200 bg-red-50 p-4 items-center"
        >
          <Text className="text-sm font-semibold text-red-600">{tm('signOut')}</Text>
        </TouchableOpacity>

        <Text className="text-center text-xs text-gray-300 mt-6">
          {tm('appVersion')} {Constants.expoConfig?.version ?? '0.1.0'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

// Onboarding — mirrors apps/web/app/onboard/page.tsx:
// creates the family, links the profile as admin, seeds default categories.
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Crypto from 'expo-crypto'
import { DEFAULT_CATEGORIES } from '@kotikassa/shared/native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { useT } from '@/lib/i18n'
import { Card, ErrorBanner, Input, Label, PrimaryButton } from '@/components/ui'

export default function OnboardScreen() {
  const t = useT('onboard')
  const { session, refreshProfile } = useAuth()
  const [familyName, setFamilyName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    setError(null)
    setLoading(true)

    const user = session?.user
    if (!user) {
      setError(t('notSignedIn'))
      setLoading(false)
      return
    }

    // 1. Create the family — client-side UUID avoids the RLS chicken-and-egg
    // (SELECT policy needs auth_family_id() but the profile isn't linked yet).
    const familyId = Crypto.randomUUID()
    const { error: familyError } = await supabase
      .from('families')
      .insert({ id: familyId, name: familyName.trim() })
    if (familyError) {
      setError(t('familyError', { message: familyError.message, code: familyError.code }))
      setLoading(false)
      return
    }

    // 2. Link the profile to this family as admin.
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ family_id: familyId, role: 'admin' })
      .eq('id', user.id)
    if (profileError) {
      setError(t('profileError', { message: profileError.message, code: profileError.code }))
      setLoading(false)
      return
    }

    // 3. Seed default categories (non-fatal on failure).
    const categoryRows = DEFAULT_CATEGORIES.map((cat) => ({
      family_id: familyId,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      sort_order: cat.sort_order,
      is_fixed: cat.is_fixed,
    }))
    const { error: catError } = await supabase.from('categories').insert(categoryRows)
    if (catError) {
      console.warn('Category seed failed:', catError.message)
    }

    // Refresh the profile so AuthGate sees family_id and routes to the tabs.
    await refreshProfile()
  }

  return (
    <SafeAreaView className="flex-1 bg-indigo-50">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-10" keyboardShouldPersistTaps="handled">
          <View className="items-center mb-8">
            <Text className="text-4xl">🏠</Text>
            <Text className="mt-2 text-2xl font-bold text-gray-900">{t('welcome')}</Text>
            <Text className="mt-1 text-sm text-gray-500">{t('subtitle')}</Text>
          </View>

          <Card className="p-6">
            <Text className="mb-2 text-lg font-semibold text-gray-900">{t('nameYourFamily')}</Text>
            <Text className="mb-6 text-sm text-gray-500">{t('nameHint')}</Text>
            <ErrorBanner message={error} />

            <View className="mb-4">
              <Label>{t('familyName')}</Label>
              <Input
                value={familyName}
                onChangeText={setFamilyName}
                placeholder={t('familyNamePlaceholder')}
                maxLength={60}
              />
            </View>

            <PrimaryButton
              title={loading ? t('creating') : t('createFamily')}
              onPress={handleCreate}
              disabled={!familyName.trim()}
              loading={loading}
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

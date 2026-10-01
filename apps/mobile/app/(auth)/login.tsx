import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { Link } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { Card, ErrorBanner, Input, Label, PrimaryButton } from '@/components/ui'

export default function LoginScreen() {
  const t = useT('login')
  const tc = useT('common')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
    // On success the AuthGate in _layout.tsx redirects automatically.
  }

  return (
    <SafeAreaView className="flex-1 bg-indigo-50">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 py-10"
          keyboardShouldPersistTaps="handled"
        >
          <View className="items-center mb-8">
            <Text className="text-5xl">🏠</Text>
            <Text className="mt-2 text-2xl font-bold text-gray-900">Kotikassa</Text>
          </View>

          <Card className="p-6">
            <Text className="mb-6 text-xl font-semibold text-gray-900">{t('title')}</Text>
            <ErrorBanner message={error} />

            <View className="mb-4">
              <Label>{tc('email')}</Label>
              <Input
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
              />
            </View>

            <View className="mb-6">
              <Label>{tc('password')}</Label>
              <View className="relative">
                <Input
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  value={password}
                  onChangeText={setPassword}
                  className="pr-14"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-0 bottom-0 justify-center"
                >
                  <Text className="text-base">{showPassword ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <PrimaryButton
              title={loading ? t('signingIn') : t('signIn')}
              onPress={handleLogin}
              disabled={!email.trim() || !password}
              loading={loading}
            />

            <View className="mt-6 flex-row justify-center">
              <Text className="text-sm text-gray-500">{t('noAccount')} </Text>
              <Link href="/signup" asChild>
                <TouchableOpacity>
                  <Text className="text-sm font-medium text-indigo-600">{t('createOne')}</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

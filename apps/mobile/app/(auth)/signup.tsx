import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import { Card, ErrorBanner, Input, Label, PrimaryButton } from '@/components/ui'

export default function SignupScreen() {
  const t = useT('signup')
  const tc = useT('common')
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [awaitingVerification, setAwaitingVerification] = useState(false)

  async function handleSignup() {
    setError(null)
    if (password.length < 8) {
      setError(t('passwordTooShort'))
      return
    }
    if (password !== confirmPassword) {
      setError(t('passwordMismatch'))
      return
    }
    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: name.trim() },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Session present → email confirmation disabled → AuthGate routes to /onboard.
    // Session null → Supabase sent a confirmation email (confirm on web, then sign in here).
    if (!data.session) {
      setAwaitingVerification(true)
      setLoading(false)
    }
  }

  if (awaitingVerification) {
    return (
      <SafeAreaView className="flex-1 bg-indigo-50 justify-center px-6">
        <Card className="p-8 items-center">
          <Text className="text-5xl">📧</Text>
          <Text className="mt-4 text-xl font-semibold text-gray-900">{t('checkEmail.title')}</Text>
          <Text className="mt-2 text-sm text-gray-500 text-center">
            {t('checkEmail.body', { email })}
          </Text>
          <Text className="mt-4 text-xs text-gray-400 text-center">{t('checkEmail.hint')}</Text>
          <TouchableOpacity onPress={() => router.replace('/login')} className="mt-6">
            <Text className="text-sm font-medium text-indigo-600">{t('signIn')}</Text>
          </TouchableOpacity>
        </Card>
      </SafeAreaView>
    )
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
          <Card className="p-6">
            <Text className="mb-6 text-xl font-semibold text-gray-900">{t('title')}</Text>
            <ErrorBanner message={error} />

            <View className="mb-4">
              <Label>{t('yourName')}</Label>
              <Input value={name} onChangeText={setName} placeholder={t('namePlaceholder')} autoComplete="name" />
            </View>

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

            <View className="mb-4">
              <Label>{tc('password')}</Label>
              <Input secureTextEntry value={password} onChangeText={setPassword} placeholder={t('passwordPlaceholder')} autoComplete="new-password" />
            </View>

            <View className="mb-6">
              <Label>{t('confirmPassword')}</Label>
              <Input secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} placeholder={t('passwordPlaceholder')} autoComplete="new-password" />
            </View>

            <PrimaryButton
              title={loading ? t('creatingAccount') : t('createAccount')}
              onPress={handleSignup}
              disabled={!name.trim() || !email.trim() || !password || !confirmPassword}
              loading={loading}
            />

            <View className="mt-6 flex-row justify-center">
              <Text className="text-sm text-gray-500">{t('alreadyHaveAccount')} </Text>
              <Link href="/login" asChild>
                <TouchableOpacity>
                  <Text className="text-sm font-medium text-indigo-600">{t('signIn')}</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

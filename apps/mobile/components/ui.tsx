// Small shared UI primitives for the mobile app.
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native'

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <View className={`rounded-2xl bg-white p-4 shadow-sm border border-gray-100 ${className}`}>
      {children}
    </View>
  )
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text className="text-xs font-medium text-gray-700 mb-1">{children}</Text>
}

export function Input(props: React.ComponentProps<typeof TextInput>) {
  const { className = '', ...rest } = props
  return (
    <TextInput
      placeholderTextColor="#9ca3af"
      className={`rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 ${className}`}
      {...rest}
    />
  )
}

export function PrimaryButton({
  title, onPress, disabled = false, loading = false, color = 'bg-indigo-600',
}: {
  title: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  color?: string
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      className={`rounded-lg px-4 py-3 items-center ${color} ${disabled || loading ? 'opacity-50' : ''}`}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" size="small" />
      ) : (
        <Text className="text-sm font-semibold text-white">{title}</Text>
      )}
    </TouchableOpacity>
  )
}

export function SecondaryButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="rounded-lg border border-gray-300 px-4 py-3 items-center"
    >
      <Text className="text-sm font-medium text-gray-600">{title}</Text>
    </TouchableOpacity>
  )
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <View className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3">
      <Text className="text-sm text-red-700">{message}</Text>
    </View>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View className="py-10 items-center">
      <Text className="text-sm text-gray-400">{title}</Text>
      {hint ? <Text className="text-xs text-gray-300 mt-1">{hint}</Text> : null}
    </View>
  )
}

export function Chip({
  label, active, onPress, activeClass = 'bg-indigo-600 border-indigo-600',
}: {
  label: string
  active: boolean
  onPress: () => void
  activeClass?: string
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`rounded-full border px-3 py-1.5 ${active ? activeClass : 'bg-white border-gray-200'}`}
    >
      <Text className={`text-xs font-medium ${active ? 'text-white' : 'text-gray-600'}`}>{label}</Text>
    </TouchableOpacity>
  )
}

// Bottom-sheet form modal: owns the keyboard-avoiding sheet, title, error
// banner, and cancel/save row; screens supply only their fields as children.
export function FormSheet({
  visible, title, error, saving, cancelTitle, saveTitle, onCancel, onSave, saveColor, children,
}: {
  visible: boolean
  title: string
  error: string | null
  saving: boolean
  cancelTitle: string
  saveTitle: string
  onCancel: () => void
  onSave: () => void
  saveColor?: string
  children: React.ReactNode
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end">
        <View className="rounded-t-3xl bg-white p-5 max-h-[85%]">
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text className="text-lg font-semibold text-gray-900 mb-4">{title}</Text>
            <ErrorBanner message={error} />
            {children}
            <View className="flex-row gap-3 mb-2">
              <View className="flex-1">
                <SecondaryButton title={cancelTitle} onPress={onCancel} />
              </View>
              <View className="flex-1">
                <PrimaryButton title={saveTitle} onPress={onSave} loading={saving} color={saveColor} />
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

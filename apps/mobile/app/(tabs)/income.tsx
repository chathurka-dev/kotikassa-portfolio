// Income — mirrors apps/web IncomePageClient: preset + custom sources,
// add/edit/delete entries, recurring toggle, People-linked rows locked.
import { useCallback, useMemo, useState } from 'react'
import { Alert, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { currentPeriodStart, periodRange, resolvePreferences, formatDate, parseAmount, today } from '@kotikassa/shared/native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { useFormatCurrency } from '@/lib/currency-context'
import { useFocusRefresh } from '@/lib/use-focus-refresh'
import { useT } from '@/lib/i18n'
import { Chip, EmptyState, FormSheet, Input, Label } from '@/components/ui'
import { MonthNav } from '@/components/MonthNav'

interface IncomeEntry {
  id: string
  source: string
  description: string | null
  amount: number
  income_date: string
  is_recurring: boolean
  recurrence_interval: string | null
  people_transaction_id: string | null
}

interface CustomSource {
  id: string
  name: string
}

const PRESET_SOURCES = ['salary', 'freelance', 'benefit', 'rental'] as const
const SOURCE_ICONS: Record<string, string> = {
  salary: '💼',
  freelance: '💻',
  benefit: '🏛️',
  rental: '🏠',
}
const INTERVALS = ['monthly', 'weekly', 'yearly'] as const
const ACTIVE_GREEN = 'bg-green-600 border-green-600'

const INCOME_COLUMNS =
  'id, source, description, amount, income_date, is_recurring, recurrence_interval, people_transaction_id'

interface FormState {
  id: string | null
  source: string
  description: string
  amount: string
  date: string
  isRecurring: boolean
  interval: string
}

const EMPTY_FORM: FormState = {
  id: null, source: 'salary', description: '', amount: '', date: today(), isRecurring: false, interval: 'monthly',
}

export default function IncomeScreen() {
  const t = useT('income')
  const tc = useT('common')
  const { session, familyId, profile } = useAuth()
  const userId = session?.user.id
  const fmt = useFormatCurrency()
  const budgetStartDay = useMemo(
    () => resolvePreferences(profile?.preferences).budgetStartDay,
    [profile?.preferences]
  )

  const [monthStart, setMonthStart] = useState(() => currentPeriodStart(budgetStartDay))
  const [entries, setEntries] = useState<IncomeEntry[]>([])
  const [customSources, setCustomSources] = useState<CustomSource[]>([])
  const [form, setForm] = useState<FormState | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [newSourceName, setNewSourceName] = useState('')
  const [addingSource, setAddingSource] = useState(false)

  const load = useCallback(async (isStale: () => boolean) => {
    if (!familyId) return
    const { from, to } = periodRange(monthStart, budgetStartDay)
    const [{ data: inc }, { data: sources }] = await Promise.all([
      supabase
        .from('income_entries')
        .select(INCOME_COLUMNS)
        .eq('family_id', familyId)
        .gte('income_date', from)
        .lte('income_date', to)
        .order('income_date', { ascending: false }),
      supabase
        .from('family_income_sources')
        .select('id, name')
        .eq('family_id', familyId)
        .order('name', { ascending: true }),
    ])
    if (isStale()) return
    setEntries(((inc as unknown as IncomeEntry[] | null) ?? []).map((e) => ({ ...e, amount: Number(e.amount) })))
    setCustomSources((sources as CustomSource[] | null) ?? [])
  }, [familyId, monthStart])

  const { refreshing, onRefresh } = useFocusRefresh(load)

  const totalIncome = entries.reduce((s, e) => s + e.amount, 0)

  function sourceLabel(source: string): string {
    if (source in SOURCE_ICONS) return `${SOURCE_ICONS[source]} ${t(`sources.${source}`)}`
    return source
  }

  async function handleAddSource() {
    const name = newSourceName.trim()
    if (!name || !familyId) return
    const { data, error } = await supabase
      .from('family_income_sources')
      .insert({ family_id: familyId, name })
      .select('id, name')
      .single()
    if (error || !data) {
      setFormError(error?.message ?? t('saveError'))
      return
    }
    setCustomSources((prev) =>
      [...prev, data as CustomSource].sort((a, b) => a.name.localeCompare(b.name))
    )
    setForm((f) => (f ? { ...f, source: name } : f))
    setNewSourceName('')
    setAddingSource(false)
  }

  function openAdd() {
    setFormError(null)
    setForm({ ...EMPTY_FORM, date: today() })
  }

  function openEdit(e: IncomeEntry) {
    if (e.people_transaction_id) {
      Alert.alert('🔒', t('lockedByPeople'))
      return
    }
    setFormError(null)
    setForm({
      id: e.id,
      source: e.source,
      description: e.description ?? '',
      amount: String(e.amount).replace('.', ','),
      date: e.income_date,
      isRecurring: e.is_recurring,
      interval: e.recurrence_interval ?? 'monthly',
    })
  }

  function confirmDelete(e: IncomeEntry) {
    if (e.people_transaction_id) {
      Alert.alert('🔒', t('lockedByPeople'))
      return
    }
    Alert.alert(t('title'), t('deleteConfirm'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: 'OK',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('income_entries').delete().eq('id', e.id)
          if (error) {
            Alert.alert(t('title'), error.message)
            return
          }
          setEntries((prev) => prev.filter((x) => x.id !== e.id))
        },
      },
    ])
  }

  async function handleSave() {
    if (!form || !familyId || !userId) return
    setFormError(null)
    const amount = parseAmount(form.amount)
    if (amount <= 0) {
      setFormError(t('invalidAmount'))
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setFormError(`${t('dateReceived')}: YYYY-MM-DD`)
      return
    }
    setSaving(true)
    const payload = {
      source: form.source,
      description: form.description.trim(),
      amount,
      income_date: form.date,
      is_recurring: form.isRecurring,
      recurrence_interval: form.isRecurring ? form.interval : null,
    }

    if (form.id) {
      const { data, error } = await supabase
        .from('income_entries')
        .update(payload)
        .eq('id', form.id)
        .select(INCOME_COLUMNS)
        .single()
      if (error || !data) {
        setFormError(error?.message ?? t('saveError'))
        setSaving(false)
        return
      }
      const row = { ...(data as unknown as IncomeEntry), amount: Number((data as unknown as IncomeEntry).amount) }
      setEntries((prev) => prev.map((x) => (x.id === form.id ? row : x)))
    } else {
      const { data, error } = await supabase
        .from('income_entries')
        .insert({ ...payload, family_id: familyId, added_by: userId })
        .select(INCOME_COLUMNS)
        .single()
      if (error || !data) {
        setFormError(error?.message ?? t('saveError'))
        setSaving(false)
        return
      }
      const row = { ...(data as unknown as IncomeEntry), amount: Number((data as unknown as IncomeEntry).amount) }
      setEntries((prev) =>
        [row, ...prev].sort((a, b) => b.income_date.localeCompare(a.income_date))
      )
    }
    setSaving(false)
    setForm(null)
  }

  function sourceChip(value: string, label: string) {
    return (
      <Chip
        key={value}
        label={label}
        active={form?.source === value}
        activeClass={ACTIVE_GREEN}
        onPress={() => setForm((f) => (f ? { ...f, source: value } : f))}
      />
    )
  }

  function renderRow({ item: e }: { item: IncomeEntry }) {
    const locked = !!e.people_transaction_id
    return (
      <TouchableOpacity
        onPress={() => openEdit(e)}
        onLongPress={() => confirmDelete(e)}
        delayLongPress={400}
        className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 bg-white"
      >
        <View className="flex-1 min-w-0 mr-3">
          <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>
            {e.description || sourceLabel(e.source)}
            {locked ? ' 🔒' : ''}
          </Text>
          <Text className="text-xs text-gray-400">
            {sourceLabel(e.source)} · {formatDate(e.income_date)}
            {e.is_recurring ? ` · 🔄 ${t(e.recurrence_interval ?? 'monthly')}` : ''}
          </Text>
        </View>
        <Text className="text-sm font-semibold text-green-600">{fmt(e.amount)}</Text>
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <View className="px-4 pt-4 pb-2 flex-row items-center justify-between">
        <Text className="text-2xl font-bold text-gray-900">{t('title')}</Text>
        <MonthNav monthStart={monthStart} onChange={setMonthStart} startDay={budgetStartDay} />
      </View>

      <Text className="px-4 pb-2 text-xs text-gray-500">
        {entries.length} · <Text className="font-semibold text-gray-700">{fmt(totalIncome)}</Text>
      </Text>

      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        renderItem={renderRow}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<EmptyState title={t('noIncome')} hint={t('noIncomeHint')} />}
        contentContainerClassName="pb-24"
      />

      {/* FAB */}
      <TouchableOpacity
        onPress={openAdd}
        className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-full bg-green-600 shadow-lg"
      >
        <Text className="text-3xl text-white leading-9">＋</Text>
      </TouchableOpacity>

      {/* Add / edit sheet */}
      <FormSheet
        visible={form !== null}
        title={form?.id ? t('editEntry') : t('newEntry')}
        error={formError}
        saving={saving}
        cancelTitle={tc('cancel')}
        saveTitle={saving ? t('saving') : t('save')}
        onCancel={() => setForm(null)}
        onSave={handleSave}
        saveColor="bg-green-600"
      >
        <View className="mb-3">
          <Label>{t('source')}</Label>
          <View className="flex-row flex-wrap gap-2">
            {PRESET_SOURCES.map((s) => sourceChip(s, `${SOURCE_ICONS[s]} ${t(`sources.${s}`)}`))}
            {customSources.map((s) => sourceChip(s.name, s.name))}
            {addingSource ? (
              <View className="flex-row items-center gap-1">
                <Input
                  value={newSourceName}
                  onChangeText={setNewSourceName}
                  placeholder={t('newSourcePlaceholder')}
                  className="w-40 py-1.5"
                  autoFocus
                />
                <TouchableOpacity onPress={handleAddSource} className="px-2 py-1.5">
                  <Text className="text-green-600 font-bold">✓</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setAddingSource(false); setNewSourceName('') }}
                  className="px-2 py-1.5"
                >
                  <Text className="text-gray-400">✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setAddingSource(true)}
                className="rounded-full border border-dashed border-gray-300 px-3 py-1.5"
              >
                <Text className="text-xs font-medium text-gray-400">＋ {t('addNewSource')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View className="flex-row gap-3 mb-3">
          <View className="flex-1">
            <Label>{t('amountLabel')}</Label>
            <Input
              value={form?.amount ?? ''}
              onChangeText={(v) => setForm((f) => (f ? { ...f, amount: v } : f))}
              keyboardType="decimal-pad"
              placeholder={t('amountPlaceholder')}
            />
          </View>
          <View className="flex-1">
            <Label>{t('dateReceived')}</Label>
            <Input
              value={form?.date ?? ''}
              onChangeText={(v) => setForm((f) => (f ? { ...f, date: v } : f))}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
            />
          </View>
        </View>

        <View className="mb-3">
          <Label>{t('description')}</Label>
          <Input
            value={form?.description ?? ''}
            onChangeText={(v) => setForm((f) => (f ? { ...f, description: v } : f))}
            placeholder={t('descriptionPlaceholder')}
          />
        </View>

        <View className="mb-5">
          <TouchableOpacity
            onPress={() => setForm((f) => (f ? { ...f, isRecurring: !f.isRecurring } : f))}
            className="flex-row items-center gap-2"
          >
            <View
              className={`h-5 w-5 rounded border items-center justify-center ${form?.isRecurring ? 'bg-green-600 border-green-600' : 'border-gray-300 bg-white'}`}
            >
              {form?.isRecurring ? <Text className="text-white text-xs">✓</Text> : null}
            </View>
            <Text className="text-sm text-gray-700">{t('recurring')}</Text>
          </TouchableOpacity>
          {form?.isRecurring && (
            <View className="flex-row gap-2 mt-2">
              {INTERVALS.map((iv) => (
                <Chip
                  key={iv}
                  label={t(iv)}
                  active={form?.interval === iv}
                  activeClass={ACTIVE_GREEN}
                  onPress={() => setForm((f) => (f ? { ...f, interval: iv } : f))}
                />
              ))}
            </View>
          )}
        </View>
      </FormSheet>
    </SafeAreaView>
  )
}

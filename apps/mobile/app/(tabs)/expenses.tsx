// Expenses — month navigation, category filter, list, add/edit/delete.
// People-linked rows (people_transaction_id) are locked, same as web.
import { useCallback, useMemo, useState } from 'react'
import { Alert, FlatList, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { currentMonthStart, currentPeriodStart, periodRange, resolvePreferences, formatDate, parseAmount, today } from '@kotikassa/shared/native'
import type { Category } from '@kotikassa/shared/native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { useFormatCurrency } from '@/lib/currency-context'
import { materializeRecurring } from '@/lib/recurring'
import { useFocusRefresh } from '@/lib/use-focus-refresh'
import { useT } from '@/lib/i18n'
import { Chip, EmptyState, FormSheet, Input, Label } from '@/components/ui'
import { MonthNav } from '@/components/MonthNav'

interface ExpenseRow {
  id: string
  name: string
  amount: number
  quantity: number | null
  unit: string | null
  discount_amount: number | null
  original_price: number | null
  expense_date: string
  category_id: string | null
  recurring_expense_id: string | null
  people_transaction_id: string | null
  notes: string | null
}

interface FormState {
  id: string | null // null = new expense
  name: string
  amount: string
  date: string
  categoryId: string | null
  quantity: string
  unit: string
}

const EMPTY_FORM: FormState = {
  id: null, name: '', amount: '', date: today(), categoryId: null, quantity: '', unit: '',
}

const EXPENSE_COLUMNS =
  'id, name, amount, quantity, unit, discount_amount, original_price, expense_date, category_id, recurring_expense_id, people_transaction_id, notes'

export default function ExpensesScreen() {
  const t = useT('expenses')
  const tc = useT('common')
  const { session, familyId, profile } = useAuth()
  const userId = session?.user.id
  const fmt = useFormatCurrency()
  const budgetStartDay = useMemo(
    () => resolvePreferences(profile?.preferences).budgetStartDay,
    [profile?.preferences]
  )

  const [monthStart, setMonthStart] = useState(() => currentPeriodStart(budgetStartDay))
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const currentMonth = monthStart.slice(0, 7)
  const isCurrentMonth = monthStart === currentPeriodStart(budgetStartDay)

  const load = useCallback(async (isStale: () => boolean) => {
    if (!familyId || !userId) return
    if (isCurrentMonth) {
      // ADR-014: materialization stays calendar-month-based even when the user's
      // budget period is offset — never pass the period-anchor month here.
      await materializeRecurring(familyId, userId, currentMonthStart().slice(0, 7))
    }
    const { from, to } = periodRange(monthStart, budgetStartDay)
    const [{ data: exp }, { data: cats }] = await Promise.all([
      supabase
        .from('expense_items')
        .select(EXPENSE_COLUMNS)
        .eq('family_id', familyId)
        .gte('expense_date', from)
        .lte('expense_date', to)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('categories')
        .select('*')
        .eq('family_id', familyId)
        .order('sort_order', { ascending: true }),
    ])
    if (isStale()) return
    setExpenses(((exp as unknown as ExpenseRow[] | null) ?? []).map((e) => ({ ...e, amount: Number(e.amount) })))
    setCategories((cats as Category[] | null) ?? [])
  }, [familyId, userId, monthStart, currentMonth, isCurrentMonth, budgetStartDay])

  const { refreshing, onRefresh } = useFocusRefresh(load)

  const catById = useMemo(() => {
    const map: Record<string, Category> = {}
    for (const c of categories) map[c.id] = c
    return map
  }, [categories])

  const visible = useMemo(
    () => (filterCategory ? expenses.filter((e) => e.category_id === filterCategory) : expenses),
    [expenses, filterCategory]
  )
  const totalVisible = visible.reduce((s, e) => s + e.amount, 0)

  function openAdd() {
    setFormError(null)
    setForm({ ...EMPTY_FORM, date: today(), categoryId: filterCategory })
  }

  function openEdit(e: ExpenseRow) {
    if (e.people_transaction_id) {
      Alert.alert('🔒', t('lockedByPeople'))
      return
    }
    setFormError(null)
    setForm({
      id: e.id,
      name: e.name,
      amount: String(e.amount).replace('.', ','),
      date: e.expense_date,
      categoryId: e.category_id,
      quantity: e.quantity != null && e.quantity !== 1 ? String(e.quantity) : '',
      unit: e.unit ?? '',
    })
  }

  function confirmDelete(e: ExpenseRow) {
    if (e.people_transaction_id) {
      Alert.alert('🔒', t('lockedByPeople'))
      return
    }
    Alert.alert(t('deleteExpense'), t(e.recurring_expense_id ? 'deleteRecurringConfirm' : 'deleteConfirm'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: t('deleteExpense'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('expense_items').delete().eq('id', e.id)
          if (error) {
            Alert.alert(t('deleteExpense'), error.message)
            return
          }
          setExpenses((prev) => prev.filter((x) => x.id !== e.id))
        },
      },
    ])
  }

  async function handleSave() {
    if (!form || !familyId || !userId) return
    setFormError(null)
    const amount = parseAmount(form.amount)
    if (!form.name.trim() || amount <= 0) {
      setFormError(t('invalidAmount'))
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setFormError(`${tc('date')}: YYYY-MM-DD`)
      return
    }
    setSaving(true)
    const quantity = form.quantity.trim() ? parseAmount(form.quantity) : 1
    const payload = {
      name: form.name.trim(),
      amount,
      expense_date: form.date,
      category_id: form.categoryId,
      quantity: quantity > 0 ? quantity : 1,
      unit: form.unit.trim() || null,
    }

    if (form.id) {
      const { data, error } = await supabase
        .from('expense_items')
        .update(payload)
        .eq('id', form.id)
        .select(EXPENSE_COLUMNS)
        .single()
      if (error || !data) {
        setFormError(error?.message ?? t('editSaveError'))
        setSaving(false)
        return
      }
      const row = { ...(data as unknown as ExpenseRow), amount: Number((data as unknown as ExpenseRow).amount) }
      setExpenses((prev) => prev.map((x) => (x.id === form.id ? row : x)))
    } else {
      const { data, error } = await supabase
        .from('expense_items')
        .insert({ ...payload, family_id: familyId, added_by: userId, is_manual: true })
        .select(EXPENSE_COLUMNS)
        .single()
      if (error || !data) {
        setFormError(error?.message ?? t('saveError'))
        setSaving(false)
        return
      }
      const row = { ...(data as unknown as ExpenseRow), amount: Number((data as unknown as ExpenseRow).amount) }
      setExpenses((prev) =>
        [row, ...prev].sort((a, b) => b.expense_date.localeCompare(a.expense_date))
      )
    }
    setSaving(false)
    setForm(null)
  }

  function renderRow({ item: e }: { item: ExpenseRow }) {
    const cat = e.category_id ? catById[e.category_id] : undefined
    const locked = !!e.people_transaction_id
    return (
      <TouchableOpacity
        onPress={() => openEdit(e)}
        onLongPress={() => confirmDelete(e)}
        delayLongPress={400}
        className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 bg-white"
      >
        <View className="flex-row items-center flex-1 min-w-0 mr-3">
          <Text className="text-lg mr-2.5">{cat?.icon ?? '📦'}</Text>
          <View className="flex-1 min-w-0">
            <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>
              {e.name}
              {e.recurring_expense_id ? ' 🔄' : ''}
              {locked ? ' 🔒' : ''}
            </Text>
            <Text className="text-xs text-gray-400">
              {formatDate(e.expense_date)}
              {e.quantity != null && e.quantity !== 1 ? ` · ${e.quantity} ${e.unit ?? ''}`.trimEnd() : ''}
            </Text>
          </View>
        </View>
        <View className="items-end">
          {e.discount_amount != null && e.original_price != null && (
            <Text className="text-xs text-gray-400 line-through">{fmt(Number(e.original_price))}</Text>
          )}
          <Text className="text-sm font-semibold text-gray-900">{fmt(e.amount)}</Text>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <View className="px-4 pt-4 pb-2 flex-row items-center justify-between">
        <Text className="text-2xl font-bold text-gray-900">{t('title')}</Text>
        <MonthNav monthStart={monthStart} onChange={setMonthStart} startDay={budgetStartDay} />
      </View>

      {/* Category filter chips */}
      <View className="pb-2">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-4 gap-2">
          <Chip label={t('allCategories')} active={!filterCategory} onPress={() => setFilterCategory(null)} />
          {categories.map((c) => (
            <Chip
              key={c.id}
              label={`${c.icon} ${c.name}`}
              active={filterCategory === c.id}
              onPress={() => setFilterCategory(filterCategory === c.id ? null : c.id)}
            />
          ))}
        </ScrollView>
      </View>

      <Text className="px-4 pb-2 text-xs text-gray-500">
        {visible.length} {t('itemsShown')} · {fmt(totalVisible)}
      </Text>

      <FlatList
        data={visible}
        keyExtractor={(e) => e.id}
        renderItem={renderRow}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<EmptyState title={t('noExpenses')} hint={t('addFirst')} />}
        contentContainerClassName="pb-24"
      />

      {/* FAB */}
      <TouchableOpacity
        onPress={openAdd}
        className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-full bg-indigo-600 shadow-lg"
      >
        <Text className="text-3xl text-white leading-9">＋</Text>
      </TouchableOpacity>

      {/* Add / edit sheet */}
      <FormSheet
        visible={form !== null}
        title={form?.id ? t('editExpense') : t('newExpense')}
        error={formError}
        saving={saving}
        cancelTitle={tc('cancel')}
        saveTitle={saving ? tc('saving') : tc('save')}
        onCancel={() => setForm(null)}
        onSave={handleSave}
      >
        <View className="mb-3">
          <Label>{t('itemName')}</Label>
          <Input
            value={form?.name ?? ''}
            onChangeText={(v) => setForm((f) => (f ? { ...f, name: v } : f))}
            placeholder={t('itemNamePlaceholder')}
          />
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
            <Label>{tc('date')}</Label>
            <Input
              value={form?.date ?? ''}
              onChangeText={(v) => setForm((f) => (f ? { ...f, date: v } : f))}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
            />
          </View>
        </View>

        <View className="mb-3">
          <Label>{tc('category')}</Label>
          <View className="flex-row flex-wrap gap-2">
            {categories.map((c) => (
              <Chip
                key={c.id}
                label={`${c.icon} ${c.name}`}
                active={form?.categoryId === c.id}
                onPress={() =>
                  setForm((f) => (f ? { ...f, categoryId: f.categoryId === c.id ? null : c.id } : f))
                }
              />
            ))}
          </View>
        </View>

        <View className="flex-row gap-3 mb-5">
          <View className="flex-1">
            <Label>{t('quantityLabel')}</Label>
            <Input
              value={form?.quantity ?? ''}
              onChangeText={(v) => setForm((f) => (f ? { ...f, quantity: v } : f))}
              keyboardType="decimal-pad"
              placeholder={t('quantityPlaceholder')}
            />
          </View>
          <View className="flex-1">
            <Label>{t('unitLabel')}</Label>
            <Input
              value={form?.unit ?? ''}
              onChangeText={(v) => setForm((f) => (f ? { ...f, unit: v } : f))}
              placeholder="kpl / kg / g"
              autoCapitalize="none"
            />
          </View>
        </View>
      </FormSheet>
    </SafeAreaView>
  )
}

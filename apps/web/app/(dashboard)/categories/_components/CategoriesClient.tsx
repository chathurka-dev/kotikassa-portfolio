'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, ChevronUp, ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createClient } from '@kotikassa/shared'

interface Category {
  id: string
  name: string
  icon: string
  color: string
  sort_order: number
}

interface Props {
  initialCategories: Category[]
  itemCounts: Record<string, number>
  familyId: string
}

const PRESET_ICONS = [
  // Food & drink
  '🥦','🍫','🍽️','☕','🍕','🍺',
  // Household
  '📦','🧴','🏠','🧹','🛒',
  // Personal & health
  '👕','🧸','💊','🏋️','💄',
  // Finance & fixed
  '⚡','💳','📱','🏦','💸',
  // Transport & travel
  '🚗','✈️','🚌',
  // Family & social
  '👨‍👩‍👧','🎉','🐾',
  // Education & work
  '📚','🎓','💻','🎮','🌐',
  // Misc
  '💰','🎸','⚽',
]
const PRESET_COLORS = ['#6b7280','#16a34a','#f59e0b','#3b82f6','#ec4899','#8b5cf6','#0891b2','#64748b','#ef4444','#f97316']

export default function CategoriesClient({ initialCategories, itemCounts, familyId }: Props) {
  const t = useTranslations('categories')
  const tc = useTranslations('common')
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [editColor, setEditColor] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('📦')
  const [newColor, setNewColor] = useState('#6b7280')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const maxOrder = Math.max(-1, ...categories.map((c) => c.sort_order))
    const { data, error: insertError } = await supabase
      .from('categories')
      .insert({ family_id: familyId, name: newName.trim(), icon: newIcon, color: newColor, sort_order: maxOrder + 1 })
      .select().single()
    if (insertError || !data) { setError(insertError?.message ?? t('saveError')); setSaving(false); return }
    setCategories([...categories, data as Category])
    setNewName(''); setNewIcon('📦'); setNewColor('#6b7280'); setShowAdd(false); setSaving(false)
  }

  function startEdit(cat: Category) { setEditingId(cat.id); setEditName(cat.name); setEditIcon(cat.icon); setEditColor(cat.color) }

  async function saveEdit(id: string) {
    setSaving(true)
    const { error: updateError } = await supabase.from('categories')
      .update({ name: editName.trim(), icon: editIcon, color: editColor }).eq('id', id)
    if (updateError) { setError(updateError.message); setSaving(false); return }
    setCategories(categories.map((c) => c.id === id ? { ...c, name: editName.trim(), icon: editIcon, color: editColor } : c))
    setEditingId(null); setSaving(false)
  }

  async function handleDelete(cat: Category) {
    const count = itemCounts[cat.id] ?? 0
    if (count > 0) {
      alert(count === 1 ? t('deleteBlockedAlert', { name: cat.name, count }) : t('deleteBlockedAlertPlural', { name: cat.name, count }))
      return
    }
    if (!confirm(t('deleteConfirm', { name: cat.name }))) return
    await supabase.from('categories').delete().eq('id', cat.id)
    setCategories(categories.filter((c) => c.id !== cat.id))
  }

  async function moveOrder(id: string, direction: 'up' | 'down') {
    const idx = categories.findIndex((c) => c.id === id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= categories.length) return
    const updated = [...categories]
    const a = updated[idx]!; const b = updated[swapIdx]!
    ;[a.sort_order, b.sort_order] = [b.sort_order, a.sort_order]
    updated[idx] = b; updated[swapIdx] = a
    setCategories([...updated])
    await Promise.all([
      supabase.from('categories').update({ sort_order: a.sort_order }).eq('id', a.id),
      supabase.from('categories').update({ sort_order: b.sort_order }).eq('id', b.id),
    ])
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('subtitle', { count: categories.length })}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold
                     text-white shadow-sm hover:bg-indigo-700 transition"
        >
          <Plus className="h-4 w-4" />
          {t('addCategory')}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">{error}</div>
      )}

      {/* Add category form */}
      {showAdd && (
        <div className="card p-5 mb-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('newCategory')}</h3>
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('name')}</label>
              <input type="text" required value={newName} onChange={(e) => setNewName(e.target.value)}
                className="input-base" placeholder={t('namePlaceholder')} autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">{t('icon')}</label>
              <div className="flex flex-wrap gap-2">
                {PRESET_ICONS.map((icon) => (
                  <button key={icon} type="button" onClick={() => setNewIcon(icon)}
                    className={`w-9 h-9 rounded-lg border-2 text-lg flex items-center justify-center
                                ${newIcon === icon ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    {icon}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">{t('colour')}</label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button key={color} type="button" onClick={() => setNewColor(color)}
                    className={`w-7 h-7 rounded-full border-2 ${newColor === color ? 'border-gray-900 scale-110' : 'border-transparent hover:border-gray-400'}`}
                    style={{ backgroundColor: color }} />
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShowAdd(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
                {tc('cancel')}
              </button>
              <button type="submit" disabled={saving || !newName.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition">
                {saving ? t('saving') : t('addCategory')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Category list */}
      <div className="card divide-y divide-gray-100">
        {categories.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400">{t('noCategories')}</div>
        )}
        {categories.map((cat, idx) => (
          <div key={cat.id} className="flex items-center gap-3 px-5 py-3">
            {/* Reorder */}
            <div className="flex flex-col gap-0.5">
              <button onClick={() => moveOrder(cat.id, 'up')} disabled={idx === 0}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-20 transition">
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => moveOrder(cat.id, 'down')} disabled={idx === categories.length - 1}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-20 transition">
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Icon */}
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
              style={{ backgroundColor: `${cat.color}22`, border: `2px solid ${cat.color}44` }}>
              {editingId === cat.id ? editIcon : cat.icon}
            </div>

            {/* Name */}
            {editingId === cat.id ? (
              <div className="flex-1 flex items-center gap-2">
                <input value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="input-base py-1.5 text-sm flex-1" autoFocus />
                <div className="flex gap-1">
                  {PRESET_ICONS.slice(0, 8).map((icon) => (
                    <button key={icon} type="button" onClick={() => setEditIcon(icon)}
                      className={`w-7 h-7 rounded text-sm flex items-center justify-center ${editIcon === icon ? 'bg-indigo-100' : 'hover:bg-gray-100'}`}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">{cat.name}</div>
                <div className="text-xs text-gray-400">{t('itemCount', { count: itemCounts[cat.id] ?? 0 })}</div>
              </div>
            )}

            {/* Actions */}
            {editingId === cat.id ? (
              <div className="flex gap-1">
                <button onClick={() => saveEdit(cat.id)} disabled={saving}
                  className="rounded-lg bg-green-600 p-1.5 text-white hover:bg-green-700 transition">
                  <Check className="h-4 w-4" />
                </button>
                <button onClick={() => setEditingId(null)}
                  className="rounded-lg border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-1">
                <button onClick={() => startEdit(cat)}
                  className="rounded-lg p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => handleDelete(cat)}
                  className="rounded-lg p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                  title={(itemCounts[cat.id] ?? 0) > 0 ? t('hasItemsTitle') : t('deleteCategoryTitle')}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

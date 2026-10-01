// ============================================================
// Kotikassa — Database Types
// These mirror the PostgreSQL schema exactly.
// When you run `supabase gen types typescript` later, replace
// this file with the auto-generated output for full type safety.
// ============================================================
import type { UserPreferences } from './preferences'

export type UserRole = 'admin' | 'member'
export type ReceiptStatus = 'pending_review' | 'confirmed' | 'manual'
// Presets are offered by the UI, but families can define additional names.
export type IncomeSource = string
export type RecurrenceInterval = 'weekly' | 'monthly' | 'yearly'

// ── Row types (what you get back from SELECT) ─────────────────

export interface Family {
  id: string
  name: string
  created_at: string
}

export interface Profile {
  id: string
  family_id: string | null
  display_name: string
  role: UserRole
  avatar_url: string | null
  preferences: UserPreferences | null // ADR-007: JSONB, resolve via resolvePreferences()
  created_at: string
}

export interface UserPrivacyChoice {
  user_id: string
  privacy_notice_version: string
  privacy_notice_shown_at: string
  receipt_scanning_enabled: boolean
  receipt_scanning_consent_version: string | null
  receipt_scanning_consented_at: string | null
  receipt_scanning_withdrawn_at: string | null
  receipt_training_enabled: boolean
  receipt_training_choice_version: string | null
  receipt_training_choice_at: string | null
  receipt_training_consented_at: string | null
  receipt_training_withdrawn_at: string | null
  receipt_training_prompt_count: number
  receipt_training_prompt_version: string | null
  receipt_training_last_prompted_at: string | null
  receipt_training_last_prompted_scan_count: number | null
  updated_at: string
}

export interface FamilyInvite {
  id: string
  family_id: string
  created_by: string
  token: string
  expires_at: string
  used_at: string | null
  used_by: string | null
  created_at: string
}

export interface Category {
  id: string
  family_id: string
  name: string
  icon: string
  color: string
  sort_order: number
  created_at: string
}

export interface Receipt {
  id: string
  family_id: string
  uploaded_by: string | null
  image_url: string | null
  store_name: string | null
  receipt_date: string | null
  total_amount: number | null
  ocr_raw_text: string | null
  ocr_confidence: number | null
  status: ReceiptStatus
  // Phase 9 scan telemetry (migration 027) — null on pre-GPT receipts
  scan_provider: string | null
  scan_model: string | null
  scan_prompt_version: string | null
  scan_schema_version: string | null
  scan_raw_result: unknown | null // validated original model JSON
  scan_latency_ms: number | null
  scan_input_tokens: number | null
  scan_output_tokens: number | null
  // Phase 10 model-development consent snapshot (migration 030).
  training_eligible: boolean
  training_consent_version: string | null
  training_consented_at: string | null
  created_at: string
}

export interface ExpenseItem {
  id: string
  family_id: string
  receipt_id: string | null
  added_by: string | null
  category_id: string | null
  catalog_item_id: string | null
  name: string
  amount: number
  quantity: number
  unit: string | null
  expense_date: string
  is_manual: boolean
  // Phase 9 (migration 027): receipt-label eligibility + deterministic order.
  // is_on_receipt is separate from is_manual (provenance) — a manually added
  // review item can be a real receipt line the model missed.
  is_on_receipt: boolean | null
  receipt_line_index: number | null
  notes: string | null
  created_at: string
}

export interface CatalogItem {
  id: string
  family_id: string
  canonical_name: string
  normalized_name: string
  created_at: string
  updated_at: string
}

export interface CatalogItemAlias {
  id: string
  family_id: string
  catalog_item_id: string
  alias_name: string
  normalized_alias: string
  created_at: string
}

export interface IncomeEntry {
  id: string
  family_id: string
  added_by: string | null
  source: IncomeSource
  description: string
  amount: number
  income_date: string
  is_recurring: boolean
  recurrence_interval: RecurrenceInterval | null
  created_at: string
}

export interface SavingsGoal {
  id: string
  family_id: string
  created_by: string | null
  name: string
  target_amount: number
  current_amount: number
  deadline: string | null
  is_private: boolean
  created_at: string
}

export type SavingsTransactionType = 'deposit' | 'withdrawal'
export type SavingsRecoveryStatus = 'active' | 'paused' | 'completed'

export interface SavingsTransaction {
  id: string
  goal_id: string
  family_id: string
  added_by: string | null
  amount: number
  note: string | null
  contributed_at: string
  transaction_type: SavingsTransactionType
  recovery_plan_id: string | null
  created_at: string
}

export interface SavingsRecoveryPlan {
  id: string
  family_id: string
  goal_id: string
  source_transaction_id: string
  created_by: string | null
  target_amount: number
  monthly_amount: number
  deadline: string | null
  status: SavingsRecoveryStatus
  created_at: string
}

export interface Budget {
  id: string
  family_id: string
  category_id: string
  // Actual budget-period start date. With budgetStartDay=15: '2026-07-15'.
  month: string
  amount: number
  created_at: string
}

export interface ItemCategoryMemory {
  id: string
  family_id: string
  item_name: string
  category_id: string
  confidence: number
  updated_at: string
}

// ── Insert types (what you pass to INSERT) ───────────────────

export type InsertCategory = Pick<Category, 'family_id' | 'name' | 'icon' | 'color' | 'sort_order'>

export type InsertExpenseItem = Pick<
  ExpenseItem,
  'family_id' | 'name' | 'amount' | 'expense_date'
> & {
  receipt_id?: string | null
  added_by?: string | null
  category_id?: string | null
  catalog_item_id?: string | null
  quantity?: number
  unit?: string | null
  is_manual?: boolean
  is_on_receipt?: boolean | null
  receipt_line_index?: number | null
  notes?: string | null
}

export type InsertIncomeEntry = Pick<
  IncomeEntry,
  'family_id' | 'source' | 'description' | 'amount' | 'income_date'
> & {
  added_by?: string | null
  is_recurring?: boolean
  recurrence_interval?: RecurrenceInterval | null
}

export type InsertSavingsGoal = Pick<SavingsGoal, 'family_id' | 'name' | 'target_amount'> & {
  created_by?: string | null
  current_amount?: number
  deadline?: string | null
  is_private?: boolean
}

export type InsertBudget = Pick<Budget, 'family_id' | 'category_id' | 'month' | 'amount'>

// ── Joined / enriched types ──────────────────────────────────

export interface ExpenseItemWithCategory extends ExpenseItem {
  category: Pick<Category, 'id' | 'name' | 'icon' | 'color'> | null
}

export interface CategoryWithTotal extends Category {
  total: number
  item_count: number
}

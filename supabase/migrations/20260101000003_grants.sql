-- ============================================================
-- Kotikassa — Table Permission Grants
-- Migration: 003_grants.sql
-- Run this AFTER 002_rls.sql
-- ============================================================
-- RLS policies control WHICH rows a role can access.
-- GRANT controls WHETHER a role can access the table at all.
-- Both are required — missing grants cause error 42501.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON families             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON family_invites       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON categories           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON receipts             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON expense_items        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON income_entries       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON savings_goals        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON budgets              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON item_category_memory TO authenticated;

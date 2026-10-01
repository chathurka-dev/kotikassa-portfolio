-- ============================================================
-- Migration 004 — Supabase Storage: receipt images
-- Run this in the Supabase SQL Editor after 003_grants.sql
-- ============================================================

-- Create the receipts storage bucket (private — no public access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,
  10485760,  -- 10MB max per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- ── RLS policies for storage.objects ────────────────────────────────────────
-- File path structure: {family_id}/{receipt_id}.jpg
-- We enforce family isolation by checking the first folder segment.

-- Allow family members to upload their own receipt images
CREATE POLICY "family_can_upload_receipts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = (
      SELECT family_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Allow family members to view their own receipt images
CREATE POLICY "family_can_view_receipts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = (
      SELECT family_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Allow family members to delete their own receipt images
CREATE POLICY "family_can_delete_receipts"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = (
      SELECT family_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

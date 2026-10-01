-- Receipt-level OCR corrections: store name and date.
-- Complements ocr_corrections (item-level). Together they form the full
-- training corpus for a Finnish receipt parser model:
--   item model  → SELECT * FROM ocr_corrections
--   store/date  → SELECT * FROM ocr_receipt_corrections
--   combined    → JOIN on receipt_id
--
-- One row per receipt scan where the user changed the store name or date.
-- NULL in corrected_* = user did not change that field (OCR was correct).

CREATE TABLE ocr_receipt_corrections (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id            uuid        NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  receipt_id           uuid        REFERENCES receipts(id) ON DELETE SET NULL,

  -- Store name: what the parser extracted vs. what the user saved
  ocr_raw_store_name   text,
  corrected_store_name text,        -- NULL = user did not change it

  -- Date: what the parser extracted vs. what the user saved (YYYY-MM-DD)
  ocr_raw_date         text,
  corrected_date       text,        -- NULL = user did not change it

  created_at           timestamptz NOT NULL DEFAULT now()
);

-- RLS: family members can insert their own corrections; no reads needed from app
-- (training export uses service-role key, which bypasses RLS)
ALTER TABLE ocr_receipt_corrections ENABLE ROW LEVEL SECURITY;

-- Supabase does not auto-grant privileges for tables created via raw SQL migrations.
-- SELECT intentionally omitted — app never reads this table.
GRANT INSERT ON ocr_receipt_corrections TO authenticated;

CREATE POLICY "family members can insert receipt corrections"
  ON ocr_receipt_corrections FOR INSERT
  TO authenticated
  WITH CHECK (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

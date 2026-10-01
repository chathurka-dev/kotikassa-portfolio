-- Track OCR output vs user-corrected values on the review screen.
-- Each row = one item where the user changed something (name, price, quantity, unit)
-- or unchecked it (corrected_name IS NULL means "excluded / not a real item").
-- This dataset is the training corpus for future fine-tuned OCR models.

CREATE TABLE ocr_corrections (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id           uuid        NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  receipt_id          uuid        REFERENCES receipts(id) ON DELETE SET NULL,

  -- What Tesseract + parser produced
  -- CHECK ensures parser regressions that produce empty names don't silently
  -- insert bad training rows (fire-and-forget insert would swallow the error).
  ocr_raw_name        text        NOT NULL CHECK (ocr_raw_name <> ''),
  ocr_raw_price       numeric,
  ocr_raw_quantity    numeric,
  ocr_raw_unit        text,

  -- What the user actually saved (NULL = item was excluded / unchecked)
  corrected_name      text,
  corrected_price     numeric,
  corrected_quantity  numeric,
  corrected_unit      text,

  -- Context
  store_name          text,

  created_at          timestamptz NOT NULL DEFAULT now()
);

-- RLS: family members can insert their own corrections; no reads needed from app
-- (training export uses service-role key, which bypasses RLS)
ALTER TABLE ocr_corrections ENABLE ROW LEVEL SECURITY;

-- Supabase does not auto-grant privileges for tables created via raw SQL migrations.
-- SELECT is intentionally omitted — the app never reads this table; training
-- export uses the service-role key which bypasses RLS and needs no explicit grant.
GRANT INSERT ON ocr_corrections TO authenticated;

CREATE POLICY "family members can insert corrections"
  ON ocr_corrections FOR INSERT
  TO authenticated
  WITH CHECK (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

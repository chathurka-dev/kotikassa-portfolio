-- Phase 9: GPT Vision receipt scanning — scan telemetry, training-label
-- eligibility, deterministic receipt order, and durable rate limiting.
-- See ADR-015 and ROADMAP.md Phase 9.

-- ── Scan telemetry on receipts ────────────────────────────────
-- Persist provider/model/prompt/schema versions plus the validated original
-- model JSON so correct, corrected and missed results share one measurable
-- baseline (compare scan_raw_result against final expense rows + corrections).
ALTER TABLE receipts
  ADD COLUMN scan_provider        text,
  ADD COLUMN scan_model           text,
  ADD COLUMN scan_prompt_version  text,
  ADD COLUMN scan_schema_version  text,
  ADD COLUMN scan_raw_result      jsonb,
  ADD COLUMN scan_latency_ms      integer,
  ADD COLUMN scan_input_tokens    integer,
  ADD COLUMN scan_output_tokens   integer;

-- No new GRANTs needed: columns inherit the existing table privileges.

-- ── Training-label eligibility + receipt order ────────────────
-- is_on_receipt: whether the saved item is visible in the receipt image.
-- Separate from is_manual (provenance): a manually added review item can be
-- a real receipt line the model missed and must stay training-eligible.
-- receipt_line_index: deterministic receipt order for the training export —
-- batch-insert created_at ordering is not reproducible.
ALTER TABLE expense_items
  ADD COLUMN is_on_receipt      boolean,
  ADD COLUMN receipt_line_index integer;

-- Conservative backfill for legacy rows: OCR-sourced items were on the
-- receipt; manually added review items cannot be verified → false.
-- Legacy rows get no line index (order not recoverable).
UPDATE expense_items
SET is_on_receipt = (NOT is_manual)
WHERE receipt_id IS NOT NULL;

-- ── Durable scan rate limiting ────────────────────────────────
-- Atomic per-family hourly counter. NOT in-memory: Vercel instances do not
-- share memory. Only the SECURITY DEFINER function below touches this table.
CREATE TABLE scan_rate_limits (
  family_id     uuid        NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  window_start  timestamptz NOT NULL,
  scan_count    integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (family_id, window_start)
);

ALTER TABLE scan_rate_limits ENABLE ROW LEVEL SECURITY;
-- Intentionally NO grants to authenticated: the table is reachable only
-- through consume_scan_quota(), which runs as its owner.

-- Returns true when the caller's family still has quota this hour.
-- Identity comes from auth.uid() (the caller's JWT) — never from arguments —
-- so a client cannot spend another family's quota. Fixed search_path per
-- SECURITY DEFINER best practice. INSERT ... ON CONFLICT is atomic under
-- concurrent requests (row-level lock on the conflict target).
CREATE OR REPLACE FUNCTION consume_scan_quota(p_limit integer DEFAULT 20)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family uuid;
  v_window timestamptz := date_trunc('hour', now());
  v_count  integer;
BEGIN
  -- The route passes 20, but the function is callable by any authenticated
  -- client — clamp so a crafted rpc() call cannot raise its own limit.
  p_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 20);

  SELECT family_id INTO v_family FROM profiles WHERE id = auth.uid();
  IF v_family IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO scan_rate_limits (family_id, window_start, scan_count)
  VALUES (v_family, v_window, 1)
  ON CONFLICT (family_id, window_start)
  DO UPDATE SET scan_count = scan_rate_limits.scan_count + 1
  RETURNING scan_count INTO v_count;

  -- Opportunistic cleanup, but only on the FIRST scan of a family's hour —
  -- not on every call. The table only ever needs the current window.
  IF v_count = 1 THEN
    DELETE FROM scan_rate_limits WHERE window_start < now() - interval '2 days';
  END IF;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION consume_scan_quota(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_scan_quota(integer) TO authenticated;

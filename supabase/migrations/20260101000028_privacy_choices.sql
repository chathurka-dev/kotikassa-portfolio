-- ============================================================
-- Kotikassa - versioned privacy acknowledgment and optional
-- receipt-scanning consent.
-- ============================================================

CREATE TABLE user_privacy_choices (
  user_id                           uuid PRIMARY KEY
                                    REFERENCES profiles(id) ON DELETE CASCADE,
  privacy_notice_version           text        NOT NULL,
  privacy_acknowledged_at          timestamptz NOT NULL DEFAULT now(),
  receipt_scanning_enabled         boolean     NOT NULL DEFAULT false,
  receipt_scanning_consent_version text,
  receipt_scanning_consented_at    timestamptz,
  receipt_scanning_withdrawn_at    timestamptz,
  updated_at                       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT receipt_scanning_consent_required CHECK (
    NOT receipt_scanning_enabled OR (
      receipt_scanning_consent_version IS NOT NULL
      AND receipt_scanning_consented_at IS NOT NULL
    )
  )
);

ALTER TABLE user_privacy_choices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "privacy_choices_select_own"
  ON user_privacy_choices FOR SELECT
  USING (user_id = auth.uid());

-- Writes go through set_privacy_choices() so timestamps come from the database.
GRANT SELECT ON user_privacy_choices TO authenticated;

CREATE OR REPLACE FUNCTION set_privacy_choices(
  p_privacy_notice_version text,
  p_receipt_scanning_enabled boolean,
  p_receipt_scanning_consent_version text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NULLIF(trim(p_privacy_notice_version), '') IS NULL THEN
    RAISE EXCEPTION 'Privacy notice version is required';
  END IF;

  IF p_receipt_scanning_enabled
     AND NULLIF(trim(p_receipt_scanning_consent_version), '') IS NULL THEN
    RAISE EXCEPTION 'Receipt scanning consent version is required';
  END IF;

  INSERT INTO user_privacy_choices (
    user_id,
    privacy_notice_version,
    privacy_acknowledged_at,
    receipt_scanning_enabled,
    receipt_scanning_consent_version,
    receipt_scanning_consented_at,
    receipt_scanning_withdrawn_at,
    updated_at
  )
  VALUES (
    v_user_id,
    trim(p_privacy_notice_version),
    now(),
    p_receipt_scanning_enabled,
    CASE WHEN p_receipt_scanning_enabled
      THEN trim(p_receipt_scanning_consent_version)
      ELSE NULL
    END,
    CASE WHEN p_receipt_scanning_enabled THEN now() ELSE NULL END,
    NULL,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    privacy_notice_version = EXCLUDED.privacy_notice_version,
    privacy_acknowledged_at = CASE
      WHEN user_privacy_choices.privacy_notice_version
           IS DISTINCT FROM EXCLUDED.privacy_notice_version
      THEN now()
      ELSE user_privacy_choices.privacy_acknowledged_at
    END,
    receipt_scanning_enabled = EXCLUDED.receipt_scanning_enabled,
    receipt_scanning_consent_version = CASE
      WHEN EXCLUDED.receipt_scanning_enabled
      THEN EXCLUDED.receipt_scanning_consent_version
      ELSE user_privacy_choices.receipt_scanning_consent_version
    END,
    receipt_scanning_consented_at = CASE
      WHEN EXCLUDED.receipt_scanning_enabled
           AND (
             NOT user_privacy_choices.receipt_scanning_enabled
             OR user_privacy_choices.receipt_scanning_consent_version
                IS DISTINCT FROM EXCLUDED.receipt_scanning_consent_version
           )
      THEN now()
      ELSE user_privacy_choices.receipt_scanning_consented_at
    END,
    receipt_scanning_withdrawn_at = CASE
      WHEN NOT EXCLUDED.receipt_scanning_enabled
           AND user_privacy_choices.receipt_scanning_enabled
      THEN now()
      WHEN EXCLUDED.receipt_scanning_enabled THEN NULL
      ELSE user_privacy_choices.receipt_scanning_withdrawn_at
    END,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION set_privacy_choices(text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_privacy_choices(text, boolean, text) TO authenticated;

-- Password signups can acknowledge the current notice before an authenticated
-- session exists (email confirmation enabled). The auth trigger records that
-- choice with database timestamps. OAuth and existing users use the RPC above.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_privacy_version text := NEW.raw_user_meta_data->>'privacy_notice_version';
  v_scanning_enabled boolean;
  v_scanning_version text := NULLIF(
    trim(NEW.raw_user_meta_data->>'receipt_scanning_consent_version'),
    ''
  );
BEGIN
  v_scanning_enabled := lower(COALESCE(
    NEW.raw_user_meta_data->>'receipt_scanning_enabled',
    'false'
  )) = 'true' AND v_scanning_version IS NOT NULL;

  INSERT INTO profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      split_part(NEW.email, '@', 1)
    )
  );

  IF NULLIF(trim(v_privacy_version), '') IS NOT NULL THEN
    INSERT INTO user_privacy_choices (
      user_id,
      privacy_notice_version,
      receipt_scanning_enabled,
      receipt_scanning_consent_version,
      receipt_scanning_consented_at
    )
    VALUES (
      NEW.id,
      trim(v_privacy_version),
      v_scanning_enabled,
      CASE WHEN v_scanning_enabled THEN v_scanning_version END,
      CASE WHEN v_scanning_enabled THEN now() END
    );
  END IF;

  RETURN NEW;
END;
$$;

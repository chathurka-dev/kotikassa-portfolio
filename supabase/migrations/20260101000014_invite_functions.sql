-- ============================================================
-- Kotikassa -- Invite SECURITY DEFINER Functions
-- Migration: 014_invite_functions.sql
-- ============================================================
-- Two PL/pgSQL functions that run with postgres-level privileges,
-- bypassing RLS. This is safe because:
--   preview_invite -- read-only, only reveals family name for a
--                     valid, non-expired, unused token
--   use_invite     -- writes, but validates every constraint
--                     inside the function body before acting
-- ============================================================

-- ── preview_invite ────────────────────────────────────────────────────────────
-- Returns the family name for a valid invite token.
-- No authentication required -- used to render the /join landing page
-- before the visitor has an account.
CREATE OR REPLACE FUNCTION public.preview_invite(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite  family_invites%ROWTYPE;
  v_family  families%ROWTYPE;
BEGIN
  SELECT * INTO v_invite FROM family_invites WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_token');
  END IF;

  IF v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  IF v_invite.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'already_used');
  END IF;

  SELECT * INTO v_family FROM families WHERE id = v_invite.family_id;

  RETURN jsonb_build_object(
    'family_id',   v_invite.family_id,
    'family_name', v_family.name
  );
END;
$$;

-- Both anon (unauthenticated visitors) and logged-in users can preview.
GRANT EXECUTE ON FUNCTION public.preview_invite(TEXT) TO anon, authenticated;


-- ── use_invite ────────────────────────────────────────────────────────────────
-- Validates the token and joins the calling user to the family.
-- Requires an authenticated session. Fails if the user already has a family.
CREATE OR REPLACE FUNCTION public.use_invite(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite          family_invites%ROWTYPE;
  v_family          families%ROWTYPE;
  v_user_id         UUID := auth.uid();
  v_current_family  UUID;
BEGIN
  -- Must be authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Must not already belong to a family
  SELECT family_id INTO v_current_family FROM profiles WHERE id = v_user_id;
  IF v_current_family IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'already_in_family');
  END IF;

  -- Find invite
  SELECT * INTO v_invite FROM family_invites WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_token');
  END IF;

  -- Check expiry
  IF v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  -- Check not already used
  IF v_invite.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'already_used');
  END IF;

  -- Join the family
  UPDATE profiles
  SET family_id = v_invite.family_id
  WHERE id = v_user_id;

  -- Mark invite as used
  UPDATE family_invites
  SET used_at = now(), used_by = v_user_id
  WHERE id = v_invite.id;

  -- Return success with family info
  SELECT * INTO v_family FROM families WHERE id = v_invite.family_id;

  RETURN jsonb_build_object(
    'family_id',   v_invite.family_id,
    'family_name', v_family.name
  );
END;
$$;

-- Only authenticated users can call use_invite.
GRANT EXECUTE ON FUNCTION public.use_invite(TEXT) TO authenticated;

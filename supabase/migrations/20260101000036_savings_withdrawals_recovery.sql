-- Phase 3c: savings withdrawals and recovery plans.
-- Existing savings_contributions rows remain valid and become deposits.

ALTER TABLE savings_contributions
  ADD COLUMN IF NOT EXISTS transaction_type text NOT NULL DEFAULT 'deposit';

ALTER TABLE savings_contributions
  DROP CONSTRAINT IF EXISTS savings_contributions_transaction_type_check;

ALTER TABLE savings_contributions
  ADD CONSTRAINT savings_contributions_transaction_type_check
  CHECK (transaction_type IN ('deposit', 'withdrawal'));

CREATE TABLE savings_recovery_plans (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id             uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  goal_id               uuid NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  source_transaction_id uuid NOT NULL UNIQUE REFERENCES savings_contributions(id) ON DELETE CASCADE,
  created_by            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  target_amount         numeric(10, 2) NOT NULL CHECK (target_amount > 0),
  monthly_amount        numeric(10, 2) NOT NULL CHECK (monthly_amount > 0),
  deadline              date,
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'paused', 'completed')),
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE savings_contributions
  ADD COLUMN IF NOT EXISTS recovery_plan_id uuid
  REFERENCES savings_recovery_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_savings_contributions_family_date_type
  ON savings_contributions (family_id, contributed_at DESC, transaction_type);

CREATE INDEX IF NOT EXISTS idx_savings_contributions_recovery_plan
  ON savings_contributions (recovery_plan_id)
  WHERE recovery_plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_savings_recovery_plans_family_status
  ON savings_recovery_plans (family_id, status);

ALTER TABLE savings_recovery_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family members can manage savings contributions"
  ON savings_contributions;

CREATE POLICY "visible goal transactions are selectable"
  ON savings_contributions FOR SELECT
  USING (
    family_id = auth_family_id()
    AND EXISTS (
      SELECT 1 FROM savings_goals goal
      WHERE goal.id = goal_id
        AND (NOT goal.is_private OR goal.created_by = auth.uid())
    )
  );

CREATE POLICY "visible goal transactions are insertable"
  ON savings_contributions FOR INSERT
  WITH CHECK (
    family_id = auth_family_id()
    AND EXISTS (
      SELECT 1 FROM savings_goals goal
      WHERE goal.id = goal_id
        AND (NOT goal.is_private OR goal.created_by = auth.uid())
    )
  );

CREATE POLICY "visible goal transactions are updatable"
  ON savings_contributions FOR UPDATE
  USING (
    family_id = auth_family_id()
    AND EXISTS (
      SELECT 1 FROM savings_goals goal
      WHERE goal.id = goal_id
        AND (NOT goal.is_private OR goal.created_by = auth.uid())
    )
  )
  WITH CHECK (
    family_id = auth_family_id()
    AND EXISTS (
      SELECT 1 FROM savings_goals goal
      WHERE goal.id = goal_id
        AND (NOT goal.is_private OR goal.created_by = auth.uid())
    )
  );

CREATE POLICY "visible goal transactions are deletable"
  ON savings_contributions FOR DELETE
  USING (
    family_id = auth_family_id()
    AND EXISTS (
      SELECT 1 FROM savings_goals goal
      WHERE goal.id = goal_id
        AND (NOT goal.is_private OR goal.created_by = auth.uid())
    )
  );

CREATE POLICY "family members can view recovery plans"
  ON savings_recovery_plans FOR SELECT
  USING (
    family_id = auth_family_id()
    AND EXISTS (
      SELECT 1 FROM savings_goals goal
      WHERE goal.id = goal_id
        AND (NOT goal.is_private OR goal.created_by = auth.uid())
    )
  );

CREATE POLICY "family members can update recovery plans"
  ON savings_recovery_plans FOR UPDATE
  USING (
    family_id = auth_family_id()
    AND EXISTS (
      SELECT 1 FROM savings_goals goal
      WHERE goal.id = goal_id
        AND (NOT goal.is_private OR goal.created_by = auth.uid())
    )
  )
  WITH CHECK (
    family_id = auth_family_id()
    AND EXISTS (
      SELECT 1 FROM savings_goals goal
      WHERE goal.id = goal_id
        AND (NOT goal.is_private OR goal.created_by = auth.uid())
    )
  );

REVOKE INSERT, UPDATE, DELETE ON savings_recovery_plans FROM authenticated;
GRANT SELECT ON savings_recovery_plans TO authenticated;

-- Balance-changing writes must go through the transaction-safe RPCs below.
-- Migration 005 granted direct writes, so explicitly remove them here.
REVOKE INSERT, UPDATE, DELETE ON savings_contributions FROM authenticated;
GRANT SELECT ON savings_contributions TO authenticated;

-- Records a deposit or withdrawal and updates the cached goal balance in the
-- same transaction. A withdrawal may create one recovery plan; deposits may be
-- linked to an active recovery plan for the same goal.
CREATE OR REPLACE FUNCTION record_savings_transaction(
  p_goal_id uuid,
  p_transaction_type text,
  p_amount numeric,
  p_note text,
  p_transaction_date date,
  p_recovery_plan_id uuid DEFAULT NULL,
  p_create_recovery boolean DEFAULT false,
  p_recovery_monthly_amount numeric DEFAULT NULL,
  p_recovery_deadline date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_family uuid;
  v_balance numeric;
  v_transaction_id uuid;
  v_plan_id uuid;
  v_plan_goal uuid;
  v_plan_target numeric;
  v_recovered numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT family_id INTO v_family FROM profiles WHERE id = v_user;
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'Family membership required';
  END IF;

  IF p_transaction_type NOT IN ('deposit', 'withdrawal')
     OR p_amount IS NULL OR p_amount <= 0
     OR p_transaction_date IS NULL
     OR length(COALESCE(p_note, '')) > 500 THEN
    RAISE EXCEPTION 'Invalid savings transaction';
  END IF;

  SELECT current_amount INTO v_balance
  FROM savings_goals
  WHERE id = p_goal_id
    AND family_id = v_family
    AND (NOT is_private OR created_by = v_user)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Savings goal not found';
  END IF;

  IF p_transaction_type = 'withdrawal' AND v_balance < p_amount THEN
    RAISE EXCEPTION 'Withdrawal exceeds savings balance';
  END IF;

  IF p_recovery_plan_id IS NOT NULL THEN
    IF p_transaction_type <> 'deposit' THEN
      RAISE EXCEPTION 'Only deposits can recover savings';
    END IF;

    SELECT goal_id, target_amount INTO v_plan_goal, v_plan_target
    FROM savings_recovery_plans
    WHERE id = p_recovery_plan_id
      AND family_id = v_family
      AND status = 'active'
    FOR UPDATE;

    IF NOT FOUND OR v_plan_goal <> p_goal_id THEN
      RAISE EXCEPTION 'Active recovery plan not found for this goal';
    END IF;
  END IF;

  IF p_create_recovery THEN
    IF p_transaction_type <> 'withdrawal'
       OR p_recovery_plan_id IS NOT NULL
       OR p_recovery_monthly_amount IS NULL
       OR p_recovery_monthly_amount <= 0
       OR (p_recovery_deadline IS NOT NULL AND p_recovery_deadline < p_transaction_date) THEN
      RAISE EXCEPTION 'Invalid recovery plan';
    END IF;
  END IF;

  INSERT INTO savings_contributions (
    goal_id, family_id, added_by, amount, note, contributed_at,
    transaction_type, recovery_plan_id
  ) VALUES (
    p_goal_id, v_family, v_user, p_amount, NULLIF(btrim(COALESCE(p_note, '')), ''),
    p_transaction_date, p_transaction_type, p_recovery_plan_id
  )
  RETURNING id INTO v_transaction_id;

  UPDATE savings_goals
  SET current_amount = current_amount + CASE
    WHEN p_transaction_type = 'deposit' THEN p_amount
    ELSE -p_amount
  END
  WHERE id = p_goal_id;

  IF p_create_recovery THEN
    INSERT INTO savings_recovery_plans (
      family_id, goal_id, source_transaction_id, created_by,
      target_amount, monthly_amount, deadline
    ) VALUES (
      v_family, p_goal_id, v_transaction_id, v_user,
      p_amount, p_recovery_monthly_amount, p_recovery_deadline
    )
    RETURNING id INTO v_plan_id;
  END IF;

  IF p_recovery_plan_id IS NOT NULL THEN
    SELECT COALESCE(sum(amount), 0) INTO v_recovered
    FROM savings_contributions
    WHERE recovery_plan_id = p_recovery_plan_id
      AND transaction_type = 'deposit';

    IF v_recovered >= v_plan_target THEN
      UPDATE savings_recovery_plans
      SET status = 'completed'
      WHERE id = p_recovery_plan_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'transactionId', v_transaction_id,
    'recoveryPlanId', v_plan_id,
    'newBalance', v_balance + CASE
      WHEN p_transaction_type = 'deposit' THEN p_amount
      ELSE -p_amount
    END
  );
END;
$$;

-- Deletes a ledger entry and reverses its balance effect atomically. If a
-- completed recovery payment is removed, its plan becomes active again.
CREATE OR REPLACE FUNCTION delete_savings_transaction(p_transaction_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_family uuid;
  v_transaction savings_contributions%ROWTYPE;
  v_balance numeric;
  v_target numeric;
  v_recovered numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT family_id INTO v_family FROM profiles WHERE id = v_user;

  SELECT sc.* INTO v_transaction
  FROM savings_contributions sc
  JOIN savings_goals sg ON sg.id = sc.goal_id
  WHERE sc.id = p_transaction_id
    AND sc.family_id = v_family
    AND (NOT sg.is_private OR sg.created_by = v_user)
  FOR UPDATE OF sc;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Savings transaction not found';
  END IF;

  SELECT current_amount INTO v_balance
  FROM savings_goals
  WHERE id = v_transaction.goal_id
  FOR UPDATE;

  IF v_transaction.transaction_type = 'deposit' AND v_balance < v_transaction.amount THEN
    RAISE EXCEPTION 'Cannot remove this deposit because later withdrawals use it';
  END IF;

  DELETE FROM savings_contributions WHERE id = p_transaction_id;

  UPDATE savings_goals
  SET current_amount = current_amount + CASE
    WHEN v_transaction.transaction_type = 'deposit' THEN -v_transaction.amount
    ELSE v_transaction.amount
  END
  WHERE id = v_transaction.goal_id
  RETURNING current_amount INTO v_balance;

  IF v_transaction.recovery_plan_id IS NOT NULL THEN
    SELECT target_amount INTO v_target
    FROM savings_recovery_plans
    WHERE id = v_transaction.recovery_plan_id;

    IF FOUND THEN
      SELECT COALESCE(sum(amount), 0) INTO v_recovered
      FROM savings_contributions
      WHERE recovery_plan_id = v_transaction.recovery_plan_id
        AND transaction_type = 'deposit';

      UPDATE savings_recovery_plans
      SET status = CASE WHEN v_recovered >= v_target THEN 'completed' ELSE 'active' END
      WHERE id = v_transaction.recovery_plan_id;
    END IF;
  END IF;

  RETURN v_balance;
END;
$$;

CREATE OR REPLACE FUNCTION set_savings_recovery_status(
  p_plan_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_family uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_status NOT IN ('active', 'paused') THEN
    RAISE EXCEPTION 'Invalid recovery status';
  END IF;

  SELECT family_id INTO v_family FROM profiles WHERE id = v_user;

  UPDATE savings_recovery_plans plan
  SET status = p_status
  FROM savings_goals goal
  WHERE plan.id = p_plan_id
    AND plan.family_id = v_family
    AND plan.status <> 'completed'
    AND goal.id = plan.goal_id
    AND (NOT goal.is_private OR goal.created_by = v_user);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active recovery plan not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION record_savings_transaction(uuid, text, numeric, text, date, uuid, boolean, numeric, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_savings_transaction(uuid, text, numeric, text, date, uuid, boolean, numeric, date) TO authenticated;

REVOKE ALL ON FUNCTION delete_savings_transaction(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_savings_transaction(uuid) TO authenticated;

REVOKE ALL ON FUNCTION set_savings_recovery_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_savings_recovery_status(uuid, text) TO authenticated;

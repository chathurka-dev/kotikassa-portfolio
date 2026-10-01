-- E2E and administrative seed workflows use the trusted service role to
-- create correction-memory fixtures. Runtime users remain read-only.

GRANT INSERT ON public.household_correction_memory TO service_role;

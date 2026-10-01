-- Server-side training export reads confirmed receipt labels with the
-- service-role key. RLS bypass does not replace table-level privileges.
GRANT SELECT ON public.receipts TO service_role;
GRANT SELECT ON public.expense_items TO service_role;

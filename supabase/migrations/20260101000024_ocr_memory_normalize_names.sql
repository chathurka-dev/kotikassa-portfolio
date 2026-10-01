-- Normalize item_category_memory keys to match the stripped item names now produced
-- by the EMBEDDED_QTY parser improvement (weight suffixes stripped from name).
-- Without this, existing entries like "mansikka 500 g" would miss lookups for the
-- stripped name "mansikka", and inserting a new entry would hit the unique constraint.

WITH stripped AS (
  SELECT
    id,
    family_id,
    TRIM(REGEXP_REPLACE(
      item_name,
      '\s+\d+[,.]?\d*\s*(kg|g|l|cl|ml|kpl|pss|pk|pkt)\s*$',
      '',
      'i'
    )) AS stripped_name,
    updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY
        family_id,
        TRIM(REGEXP_REPLACE(
          item_name,
          '\s+\d+[,.]?\d*\s*(kg|g|l|cl|ml|kpl|pss|pk|pkt)\s*$',
          '',
          'i'
        ))
      ORDER BY updated_at DESC
    ) AS rn
  FROM item_category_memory
),
duplicates AS (
  SELECT id FROM stripped WHERE rn > 1
)
DELETE FROM item_category_memory
WHERE id IN (SELECT id FROM duplicates);

-- Step 2: normalise the surviving rows to the stripped name
UPDATE item_category_memory
SET
  item_name = TRIM(REGEXP_REPLACE(
    item_name,
    '\s+\d+[,.]?\d*\s*(kg|g|l|cl|ml|kpl|pss|pk|pkt)\s*$',
    '',
    'i'
  )),
  updated_at = now()
WHERE item_name ~ '\s+\d+[,.]?\d*\s*(kg|g|l|cl|ml|kpl|pss|pk|pkt)\s*$';

-- Normalises existing envelope transaction descriptions: collapses internal
-- whitespace runs to a single space and trims leading/trailing whitespace.
-- Idempotent. Descriptions that become empty are set to NULL.
--

UPDATE "envelope_transactions"
SET "description" = NULLIF(btrim(regexp_replace("description", '\s+', ' ', 'g')), '')
WHERE "description" IS NOT NULL;

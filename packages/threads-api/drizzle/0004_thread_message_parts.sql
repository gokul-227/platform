-- The structured form of a message, beside the flat `content` text: tool calls,
-- reasoning, attachments, approvals. Opaque jsonb — the contract validates the
-- envelope (`type` names the variant) and the writing app owns the vocabulary,
-- exactly as `metadata` and `references` already work.
--
-- Nullable rather than defaulted to '[]': NULL says the writer sent none, which
-- is what every row written before this column existed means. A default would
-- claim those rows had an empty structure, which is a different statement.
ALTER TABLE "thread_message" ADD COLUMN IF NOT EXISTS "parts" jsonb;

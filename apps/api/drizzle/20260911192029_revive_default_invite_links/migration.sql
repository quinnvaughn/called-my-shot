-- Clears the expiry on invite links that got a 7-day expiry by default rather
-- than by choice, so those links work again wherever they were posted. A
-- default expiry lands exactly 7 days after created_at. A link someone set by
-- hand gets its expiry when it's reset, and resetting never changes
-- created_at, so those don't match and keep the expiry they were given.
UPDATE "group_invites"
SET "expires_at" = NULL
WHERE "expires_at" IS NOT NULL
	AND abs(extract(epoch FROM ("expires_at" - "created_at")) - 604800) < 60;

-- One-time backfill for group_members.welcome_dismissed_at (see the previous
-- migration). The welcome modal is for people joining from here on, so every
-- membership that already exists is marked as having seen it, as of when
-- that member joined.
UPDATE "group_members" SET "welcome_dismissed_at" = "joined_at" WHERE "welcome_dismissed_at" IS NULL;
